/**
 * @nexusbrain/openclaw-plugin — Entry Point
 *
 * Default export: async plugin initializer called by OpenClaw.
 * Named exports: individual registration functions for advanced usage.
 *
 * Architecture:
 *   1. Commands  — 8 slash-style auto-reply commands
 *   2. Tools     — 21 MCP tools exposed to the LLM agent
 *   3. Hooks     — Lifecycle hooks (causal context injection)
 *   4. Services  — Background daemons (reinforcement + proactive)
 */

import { createPluginConfig, type PluginConfig } from './config.js';
import { registerCommands } from './commands.js';
import { registerTools } from './tools.js';
import { registerHooks } from './hooks.js';
import { registerCopilotBridge } from './copilot-bridge.js';

// Reinforcement services
import { registerOutcomeCollector } from './reinforcement/outcome-collector.js';
import { registerFeedbackAgent } from './reinforcement/feedback-agent.js';
import { registerAnomalyWatchdog } from './reinforcement/anomaly-watchdog.js';
import { registerConsolidationRunner } from './reinforcement/consolidation-runner.js';
import { registerSignalHarvester } from './reinforcement/signal-harvester.js';

// Proactive services
import { registerTechDebtAlarm } from './proactive/tech-debt-alarm.js';
import { registerReconciliationRunner } from './proactive/reconciliation-runner.js';
import { registerCashFlowProphet } from './proactive/cash-flow-prophet.js';

// ---------------------------------------------------------------------------
// Minimal OpenClaw host API (union of all module requirements)
// ---------------------------------------------------------------------------

interface OpenClawApi {
  getConfig(): Record<string, unknown>;
  registerCommand(def: {
    name: string;
    description: string;
    acceptsArgs: boolean;
    requireAuth: boolean;
    handler: (ctx: { args?: string }) => Promise<{ text: string }>;
  }): void;
  registerTool(
    name: string,
    def: {
      description: string;
      parameters: unknown;
      execute: (input: any) => Promise<unknown>;
    },
  ): void;
  registerService(def: {
    id: string;
    start(): Promise<void> | void;
    stop?(): Promise<void> | void;
  }): void;
  registerGatewayMethod?(
    method: string,
    handler: (params: Record<string, unknown>) => Promise<unknown>,
  ): void;
  on?(event: string, handler: (...args: unknown[]) => Promise<void> | void): void;
  log?(level: string, message: string): void;
}

// ---------------------------------------------------------------------------
// Default export — OpenClaw calls this to initialize the plugin
// ---------------------------------------------------------------------------

export default async function nexusBrainPlugin(api: OpenClawApi): Promise<void> {
  api.log?.('info', 'NexusBrain plugin initializing...');

  // 1. Parse and validate config
  const rawConfig = api.getConfig();
  let config: PluginConfig;
  try {
    config = createPluginConfig(rawConfig);
  } catch (err) {
    api.log?.('error', `NexusBrain: config validation failed — ${err}`);
    throw err;
  }

  // 2. Register commands, tools, and hooks
  registerCommands(api, config);
  registerTools(api, config);
  registerHooks(api, config);

  // 2b. Register Copilot Bridge gateway methods (if host supports it)
  if (api.registerGatewayMethod) {
    registerCopilotBridge(
      api as Parameters<typeof registerCopilotBridge>[0],
      config,
    );
  } else {
    api.log?.('info', 'NexusBrain: host does not support registerGatewayMethod — Copilot bridge skipped');
  }

  // 3. Register reinforcement services (if enabled)
  if (config.reinforcement.enabled) {
    registerOutcomeCollector(api, config);
    registerFeedbackAgent(api, config);
    registerAnomalyWatchdog(api, config);
    registerConsolidationRunner(api, config);
    registerSignalHarvester(api, config);
    api.log?.('info', 'NexusBrain: reinforcement loop services registered (5 services)');
  } else {
    api.log?.('info', 'NexusBrain: reinforcement loop disabled');
  }

  // 4. Register proactive services (each checks its own enabled flag)
  registerTechDebtAlarm(api, config);
  registerReconciliationRunner(api, config);
  registerCashFlowProphet(api, config);

  api.log?.('info', 'NexusBrain plugin ready — 8 commands, 21 tools, hooks + services + copilot bridge active');
}

// ---------------------------------------------------------------------------
// Named exports for advanced / programmatic usage
// ---------------------------------------------------------------------------

export { createPluginConfig, type PluginConfig } from './config.js';
export { registerCommands } from './commands.js';
export { registerTools } from './tools.js';
export { registerHooks } from './hooks.js';
export { registerOutcomeCollector } from './reinforcement/outcome-collector.js';
export { registerFeedbackAgent } from './reinforcement/feedback-agent.js';
export { registerAnomalyWatchdog } from './reinforcement/anomaly-watchdog.js';
export { registerConsolidationRunner } from './reinforcement/consolidation-runner.js';
export { registerSignalHarvester } from './reinforcement/signal-harvester.js';
export { registerTechDebtAlarm } from './proactive/tech-debt-alarm.js';
export { registerReconciliationRunner } from './proactive/reconciliation-runner.js';
export { registerCashFlowProphet } from './proactive/cash-flow-prophet.js';
export { registerCopilotBridge, serviceTracker } from './copilot-bridge.js';
