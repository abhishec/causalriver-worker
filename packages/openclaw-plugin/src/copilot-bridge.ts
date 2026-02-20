/**
 * CopilotBridge — Registers Gateway RPC methods so the cloud Copilot
 * can orchestrate the local OpenClaw daemon remotely.
 *
 * Registered methods:
 *   nexusbrain.query         — Execute a brain query and return result
 *   nexusbrain.ingest        — Ingest signals
 *   nexusbrain.relationships — Read causal edges
 *   nexusbrain.services      — List all running services + their status
 *   nexusbrain.trigger       — Manually trigger a service (e.g. force outcome collection)
 *   nexusbrain.health        — Full health check (brain + services + reinforcement status)
 *   nexusbrain.reinforcement — Get reinforcement loop status (last run, predictions verified, accuracy)
 */

import type { NexusClient } from '@nexus-ai/client';
import type { PluginConfig, SupabaseConfig } from './config.js';
import {
  handleQuery,
  handleIngest,
  handleRelationships,
} from '@nexus-ai/mcp-server/handlers';

// Import service runners for manual trigger
import { collectOutcomes } from './reinforcement/outcome-collector.js';
import { runFeedbackLoop } from './reinforcement/feedback-agent.js';
import { checkForAnomalies } from './reinforcement/anomaly-watchdog.js';
import { runConsolidation } from './reinforcement/consolidation-runner.js';
import { checkTechDebt } from './proactive/tech-debt-alarm.js';
import { runReconciliation } from './proactive/reconciliation-runner.js';
import { runCashFlowForecast } from './proactive/cash-flow-prophet.js';

// ---------------------------------------------------------------------------
// OpenClaw Gateway API surface
// ---------------------------------------------------------------------------

interface OpenClawApi {
  registerGatewayMethod(
    method: string,
    handler: (params: Record<string, unknown>) => Promise<unknown>,
  ): void;
  log?(level: string, message: string): void;
}

// ---------------------------------------------------------------------------
// Service Tracker — module-level Map that background services update
// ---------------------------------------------------------------------------

export interface ServiceStatus {
  id: string;
  status: 'running' | 'stopped' | 'error';
  lastRun: Date | null;
  nextRun: Date | null;
  runCount: number;
  lastError: string | null;
  stats: Record<string, unknown>;
}

export const serviceTracker = new Map<string, ServiceStatus>();

// ---------------------------------------------------------------------------
// Reinforcement stats — accumulated across feedback runs
// ---------------------------------------------------------------------------

interface ReinforcementStats {
  lastOutcomeCollection: string | null;
  lastFeedbackRun: string | null;
  predictionsVerified: number;
  accuracy: number;
  edgesStrengthened: number;
  edgesWeakened: number;
}

const reinforcementStats: ReinforcementStats = {
  lastOutcomeCollection: null,
  lastFeedbackRun: null,
  predictionsVerified: 0,
  accuracy: 0,
  edgesStrengthened: 0,
  edgesWeakened: 0,
};

// ---------------------------------------------------------------------------
// Service ID → runner function mapping
// ---------------------------------------------------------------------------

function buildServiceRunners(config: PluginConfig) {
  const { client, supabase } = config;

  const runners: Record<string, () => Promise<unknown>> = {
    'nexusbrain-outcome-collector': async () => {
      const results = await collectOutcomes(client, supabase);
      reinforcementStats.lastOutcomeCollection = new Date().toISOString();
      updateServiceTracker('nexusbrain-outcome-collector', results);
      return { collected: results.length, timestamp: new Date().toISOString() };
    },

    'nexusbrain-feedback-agent': async () => {
      const summary = await runFeedbackLoop(client, supabase);
      reinforcementStats.lastFeedbackRun = new Date().toISOString();
      reinforcementStats.predictionsVerified += summary.totalVerified;
      reinforcementStats.edgesStrengthened += summary.edgesStrengthened;
      reinforcementStats.edgesWeakened += summary.edgesWeakened;
      if (summary.totalVerified > 0) {
        // Weighted rolling accuracy
        const totalPrev = reinforcementStats.predictionsVerified - summary.totalVerified;
        const prevAccuracy = totalPrev > 0 ? reinforcementStats.accuracy : 0;
        const batchAccuracy = summary.correct / summary.totalVerified;
        reinforcementStats.accuracy =
          totalPrev > 0
            ? (prevAccuracy * totalPrev + batchAccuracy * summary.totalVerified) /
              reinforcementStats.predictionsVerified
            : batchAccuracy;
      }
      updateServiceTracker('nexusbrain-feedback-agent', summary);
      return summary;
    },

    'nexusbrain-anomaly-watchdog': async () => {
      const report = await checkForAnomalies(client);
      updateServiceTracker('nexusbrain-anomaly-watchdog', report);
      return report;
    },

    'nexusbrain-consolidation-runner': async () => {
      const result = await runConsolidation(client);
      updateServiceTracker('nexusbrain-consolidation-runner', result);
      return result;
    },

    'nexusbrain-tech-debt-alarm': async () => {
      const report = await checkTechDebt(client);
      updateServiceTracker('nexusbrain-tech-debt-alarm', report);
      return report;
    },

    'nexusbrain-reconciliation-runner': async () => {
      const report = await runReconciliation(client);
      updateServiceTracker('nexusbrain-reconciliation-runner', report);
      return report;
    },

    'nexusbrain-cash-flow-prophet': async () => {
      const report = await runCashFlowForecast(client);
      updateServiceTracker('nexusbrain-cash-flow-prophet', report);
      return report;
    },
  };

  return runners;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function updateServiceTracker(
  serviceId: string,
  result: unknown,
): void {
  const entry = serviceTracker.get(serviceId);
  if (entry) {
    entry.lastRun = new Date();
    entry.runCount++;
    entry.status = 'running';
    entry.lastError = null;
    entry.stats = { lastResult: result };
  }
}

function serializeServiceStatus(entry: ServiceStatus) {
  return {
    id: entry.id,
    status: entry.status,
    lastRun: entry.lastRun?.toISOString() ?? null,
    nextRun: entry.nextRun?.toISOString() ?? null,
    runCount: entry.runCount,
    lastError: entry.lastError,
    stats: entry.stats,
  };
}

// ---------------------------------------------------------------------------
// registerCopilotBridge — the main export
// ---------------------------------------------------------------------------

export function registerCopilotBridge(
  api: OpenClawApi,
  config: PluginConfig,
): void {
  const { client } = config;
  const runners = buildServiceRunners(config);

  // -----------------------------------------------------------------------
  // nexusbrain.query — Execute a brain query
  // -----------------------------------------------------------------------
  api.registerGatewayMethod(
    'nexusbrain.query',
    async (params: Record<string, unknown>) => {
      const question = params.question as string | undefined;
      if (!question) {
        throw new Error('nexusbrain.query requires a "question" parameter');
      }
      const domain = params.domain as string | undefined;
      const result = await handleQuery(client, { question, domain });
      return result;
    },
  );

  // -----------------------------------------------------------------------
  // nexusbrain.ingest — Ingest signals into the brain
  // -----------------------------------------------------------------------
  api.registerGatewayMethod(
    'nexusbrain.ingest',
    async (params: Record<string, unknown>) => {
      const signals = params.signals as unknown[];
      if (!Array.isArray(signals) || signals.length === 0) {
        throw new Error('nexusbrain.ingest requires a non-empty "signals" array');
      }
      const result = await handleIngest(client, { signals: signals as any });
      return result;
    },
  );

  // -----------------------------------------------------------------------
  // nexusbrain.relationships — Read discovered causal edges
  // -----------------------------------------------------------------------
  api.registerGatewayMethod(
    'nexusbrain.relationships',
    async (params: Record<string, unknown>) => {
      const limit = params.limit as number | undefined;
      const result = await handleRelationships(client, { limit });
      return result;
    },
  );

  // -----------------------------------------------------------------------
  // nexusbrain.services — List all registered services + their status
  // -----------------------------------------------------------------------
  api.registerGatewayMethod(
    'nexusbrain.services',
    async () => {
      const services = Array.from(serviceTracker.values()).map(serializeServiceStatus);
      return { services };
    },
  );

  // -----------------------------------------------------------------------
  // nexusbrain.trigger — Manually trigger a background service
  // -----------------------------------------------------------------------
  api.registerGatewayMethod(
    'nexusbrain.trigger',
    async (params: Record<string, unknown>) => {
      const serviceId = params.serviceId as string | undefined;
      if (!serviceId) {
        throw new Error('nexusbrain.trigger requires a "serviceId" parameter');
      }

      const runner = runners[serviceId];
      if (!runner) {
        const available = Object.keys(runners).join(', ');
        throw new Error(
          `Unknown serviceId "${serviceId}". Available services: ${available}`,
        );
      }

      // Update tracker to reflect manual trigger
      const entry = serviceTracker.get(serviceId);
      if (entry) {
        entry.status = 'running';
      }

      api.log?.('info', `CopilotBridge: manually triggering service "${serviceId}"`);

      try {
        const result = await runner();
        api.log?.('info', `CopilotBridge: service "${serviceId}" completed successfully`);
        return {
          serviceId,
          status: 'completed',
          result,
          triggeredAt: new Date().toISOString(),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        api.log?.('error', `CopilotBridge: service "${serviceId}" failed — ${message}`);

        if (entry) {
          entry.status = 'error';
          entry.lastError = message;
        }

        throw new Error(`Service "${serviceId}" failed: ${message}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // nexusbrain.health — Full health check
  // -----------------------------------------------------------------------
  api.registerGatewayMethod(
    'nexusbrain.health',
    async () => {
      // Brain health — ping with a lightweight query
      let brainHealthy = false;
      let brainLatencyMs = 0;
      let brainError: string | null = null;
      try {
        const start = Date.now();
        await client.query('ping', { domain: 'engineering' });
        brainLatencyMs = Date.now() - start;
        brainHealthy = true;
      } catch (err) {
        brainError = err instanceof Error ? err.message : String(err);
      }

      // Service health summary
      const allServices = Array.from(serviceTracker.values());
      const reinforcementServices = allServices.filter(s =>
        s.id.startsWith('nexusbrain-outcome') ||
        s.id.startsWith('nexusbrain-feedback') ||
        s.id.startsWith('nexusbrain-anomaly') ||
        s.id.startsWith('nexusbrain-consolidation') ||
        s.id.startsWith('nexusbrain-signal'),
      );
      const proactiveServices = allServices.filter(s =>
        s.id.startsWith('nexusbrain-tech-debt') ||
        s.id.startsWith('nexusbrain-reconciliation') ||
        s.id.startsWith('nexusbrain-cash-flow'),
      );

      const countByStatus = (list: ServiceStatus[]) => ({
        total: list.length,
        running: list.filter(s => s.status === 'running').length,
        stopped: list.filter(s => s.status === 'stopped').length,
        error: list.filter(s => s.status === 'error').length,
      });

      const reinforcementHealth = {
        ...countByStatus(reinforcementServices),
        enabled: config.reinforcement.enabled,
        services: reinforcementServices.map(serializeServiceStatus),
      };

      const proactiveHealth = {
        ...countByStatus(proactiveServices),
        services: proactiveServices.map(serializeServiceStatus),
      };

      // Overall status
      const hasErrors = allServices.some(s => s.status === 'error');
      const overall = !brainHealthy
        ? 'degraded'
        : hasErrors
          ? 'degraded'
          : 'healthy';

      return {
        brain: {
          healthy: brainHealthy,
          latencyMs: brainLatencyMs,
          error: brainError,
          orgId: config.supabase.orgId,
        },
        reinforcement: reinforcementHealth,
        proactive: proactiveHealth,
        overall,
      };
    },
  );

  // -----------------------------------------------------------------------
  // nexusbrain.reinforcement — Reinforcement loop status
  // -----------------------------------------------------------------------
  api.registerGatewayMethod(
    'nexusbrain.reinforcement',
    async () => {
      return {
        enabled: config.reinforcement.enabled,
        lastOutcomeCollection: reinforcementStats.lastOutcomeCollection,
        lastFeedbackRun: reinforcementStats.lastFeedbackRun,
        predictionsVerified: reinforcementStats.predictionsVerified,
        accuracy: Math.round(reinforcementStats.accuracy * 10000) / 10000,
        edgesStrengthened: reinforcementStats.edgesStrengthened,
        edgesWeakened: reinforcementStats.edgesWeakened,
      };
    },
  );

  api.log?.('info', 'CopilotBridge: 7 gateway RPC methods registered');
}
