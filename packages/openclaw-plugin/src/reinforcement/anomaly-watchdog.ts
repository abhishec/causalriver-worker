/**
 * AnomalyWatchdog — Continuous anomaly detection + alerting
 *
 * Every hour, asks the brain to check for cross-domain anomalies.
 * When anomalies are detected:
 * 1. Traces causal chain (what caused this?)
 * 2. Assesses impact (what will this affect?)
 * 3. Ingests the detection as a signal (brain remembers it checked)
 *
 * Schedule: Every 1 hour (configurable)
 */

import type { NexusClient } from '@nexus-ai/client';
import type { PluginConfig } from '../config.js';

interface OpenClawApi {
  log?(level: string, message: string): void;
  registerService(def: { id: string; start(): Promise<void> | void; stop?(): Promise<void> | void }): void;
  on?(event: string, handler: (...args: unknown[]) => Promise<void> | void): void;
}

interface AnomalyReport {
  hasAnomalies: boolean;
  anomalyCount: number;
  summary: string;
  domains: string[];
}

export async function checkForAnomalies(
  client: NexusClient,
  log?: (level: string, msg: string) => void,
): Promise<AnomalyReport> {
  try {
    const result = await client.query(
      'Run a cross-domain anomaly check for the last hour. ' +
      'For each anomaly found, provide: ' +
      '1. Which domain and metric is anomalous ' +
      '2. The causal chain (what likely caused it) ' +
      '3. Predicted downstream impact ' +
      '4. Urgency level (critical/warning/info) ' +
      'If no anomalies, say "No anomalies detected."',
    );

    const answer = result.answer;
    const hasAnomalies = !answer.toLowerCase().includes('no anomalies detected');

    // Ingest the watchdog check itself as a signal
    await client.ingest([{
      source_domain: 'engineering',
      signal_type: 'anomaly_watchdog_check',
      signal_value: hasAnomalies ? 1 : 0,
      metadata: {
        has_anomalies: hasAnomalies,
        checked_by: 'openclaw-anomaly-watchdog',
      },
    }]);

    // Extract mentioned domains from causal context
    const domains: string[] = [];
    for (const rel of result.context.causal) {
      if (rel.source_domain && !domains.includes(rel.source_domain)) domains.push(rel.source_domain);
      if (rel.target_domain && !domains.includes(rel.target_domain)) domains.push(rel.target_domain);
    }

    return {
      hasAnomalies,
      anomalyCount: hasAnomalies ? Math.max(1, domains.length) : 0,
      summary: answer,
      domains,
    };
  } catch (err) {
    log?.('warn', `AnomalyWatchdog: check failed — ${err}`);
    return { hasAnomalies: false, anomalyCount: 0, summary: '', domains: [] };
  }
}

export function registerAnomalyWatchdog(
  api: OpenClawApi,
  config: PluginConfig,
): void {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const intervalMs = config.reinforcement.anomalyWatchdogIntervalMinutes * 60 * 1000;

  api.registerService({
    id: 'nexusbrain-anomaly-watchdog',

    async start() {
      api.log?.('info', `AnomalyWatchdog: starting (every ${config.reinforcement.anomalyWatchdogIntervalMinutes}m)`);

      intervalId = setInterval(async () => {
        try {
          const report = await checkForAnomalies(config.client, api.log?.bind(api));
          if (report.hasAnomalies) {
            api.log?.('warn', `AnomalyWatchdog: ${report.anomalyCount} anomaly(ies) detected in [${report.domains.join(', ')}]`);
          } else {
            api.log?.('debug', 'AnomalyWatchdog: all clear');
          }
        } catch (err) {
          api.log?.('error', `AnomalyWatchdog: unhandled error: ${err}`);
        }
      }, intervalMs);
    },

    stop() {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      api.log?.('info', 'AnomalyWatchdog: stopped');
    },
  });
}
