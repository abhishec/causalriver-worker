/**
 * TechDebtAlarm — Daily SE-aaS proactive tech debt detection
 *
 * Uses NexusBrain's causal graph to detect architecture risks before
 * they become problems. Checks for:
 * - Circular dependencies forming
 * - Code coupling increasing
 * - CI failure rate trending up
 * - Deploy velocity dropping
 *
 * Sends alerts to the engineering channel when risks exceed threshold.
 *
 * Schedule: Daily (after consolidation)
 */

import type { NexusClient } from '@nexus-ai/client';
import type { PluginConfig } from '../config.js';

interface TechDebtReport {
  hasRisks: boolean;
  riskCount: number;
  summary: string;
  topRisks: string[];
}

export async function checkTechDebt(
  client: NexusClient,
  log?: (level: string, msg: string) => void,
): Promise<TechDebtReport> {
  try {
    const result = await client.query(
      'Analyze current tech debt risks based on causal patterns. Check for: ' +
      '1. Code coupling trends (are any modules becoming tightly coupled?) ' +
      '2. CI/CD health (failure rate trends, flaky tests) ' +
      '3. Deploy velocity (is it slowing down? what is causing it?) ' +
      '4. Architecture risks (circular dependencies, single points of failure) ' +
      '5. Knowledge concentration (are critical systems owned by too few people?) ' +
      'For each risk found, provide severity (critical/warning/info), ' +
      'causal evidence, and recommended action. ' +
      'If no significant risks, say "No significant tech debt risks detected."',
      { domain: 'engineering' },
    );

    const answer = result.answer;
    const hasRisks = !answer.toLowerCase().includes('no significant tech debt risks');

    // Extract risk items
    const topRisks: string[] = [];
    const riskMatches = answer.match(/(?:critical|warning|high|medium)[:.]?\s*(.+?)(?:\n|$)/gi);
    if (riskMatches) {
      for (const match of riskMatches.slice(0, 5)) {
        topRisks.push(match.trim());
      }
    }

    // Ingest the check as a signal
    await client.ingest([{
      source_domain: 'engineering',
      signal_type: 'tech_debt_alarm_check',
      signal_value: hasRisks ? topRisks.length : 0,
      metadata: {
        has_risks: hasRisks,
        risk_count: topRisks.length,
        checked_by: 'openclaw-tech-debt-alarm',
      },
    }]);

    return {
      hasRisks,
      riskCount: topRisks.length,
      summary: answer,
      topRisks,
    };
  } catch (err) {
    log?.('warn', `TechDebtAlarm: check failed — ${err}`);
    return { hasRisks: false, riskCount: 0, summary: '', topRisks: [] };
  }
}

export function registerTechDebtAlarm(
  api: { registerService(def: { id: string; start(): Promise<void> | void; stop?(): void }): void; log?(level: string, msg: string): void },
  config: PluginConfig,
): void {
  if (!config.proactive.techDebtAlarmEnabled) {
    api.log?.('info', 'TechDebtAlarm: disabled in config');
    return;
  }

  let intervalId: ReturnType<typeof setInterval> | null = null;
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  // Run 1 hour after consolidation
  const offsetMs = (config.reinforcement.consolidationCronHour + 1) * 60 * 60 * 1000;

  api.registerService({
    id: 'nexusbrain-tech-debt-alarm',

    async start() {
      api.log?.('info', 'TechDebtAlarm: starting (daily, 1h after consolidation)');

      const now = new Date();
      const next = new Date(now);
      next.setHours(config.reinforcement.consolidationCronHour + 1, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      const msUntilFirst = next.getTime() - now.getTime();

      setTimeout(async () => {
        await checkTechDebt(config.client, api.log?.bind(api));
        intervalId = setInterval(async () => {
          try {
            await checkTechDebt(config.client, api.log?.bind(api));
          } catch (err) {
            api.log?.('error', `TechDebtAlarm: unhandled error: ${err}`);
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
