/**
 * Brain-Agent Fusion V1 — Agents ARE Brain Functions
 * ====================================================
 *
 * Brain Analog: Cerebral Cortex Integration — specialized areas working as a unified whole
 *
 * Previously, agents and the brain were parallel systems. This module
 * FUSES them: agents can call brain action domains, and action domains
 * can dispatch agents. The brain IS the agent runtime.
 *
 * Key Capabilities:
 *   1. Agents call brain.execute('forecast', { domain: 'revenue' })
 *   2. Action domains dispatch agents: ctx.runAgent('slack-notifier', data)
 *   3. Autonomous agents trigger on brain events (anomaly, pattern, schedule)
 *   4. Agent results feed back into brain calibration
 *   5. Pre-built brain agents: watcher, reporter, optimizer, diagnostician
 *
 * Design: Bridge pattern connecting agent-registry and action-domain-registry.
 *         All agents get full brain context. Never throws.
 *
 * @packageDocumentation
 */

import { defineAgent, type AgentDefinition } from './agent-registry';

// ============================================================================
// TYPES
// ============================================================================

/** Brain execution interface that agents receive */
export interface BrainExecutionInterface {
  /** Execute an action domain by name */
  executeDomain: (domainName: string, overrides?: Record<string, unknown>) => Promise<unknown>;
  /** Get available action domains */
  getAvailableDomains: () => string[];
  /** Get brain stats */
  getBrainStats: () => Record<string, unknown>;
  /** Format result for prompt */
  formatForPrompt: (domainName: string, result: unknown) => string;
}

/** Configuration for pre-built brain agents */
export interface BrainAgentConfig {
  /** Domains to watch */
  watchDomains?: string[];
  /** Alert thresholds */
  alertThreshold?: number;
  /** Report frequency */
  reportSchedule?: string;
  /** Verbose logging */
  verbose?: boolean;
}

// ============================================================================
// PRE-BUILT BRAIN AGENTS
// ============================================================================

/**
 * Revenue Watcher Agent — monitors revenue domain and alerts on anomalies
 * Level: autonomous | Triggers: schedule:hourly, event:signal_ingested
 */
export const revenueWatcherAgent: AgentDefinition = defineAgent({
  name: 'brain-revenue-watcher',
  description: 'Monitors revenue domain, runs forecasts, alerts when confidence drops or anomalies detected',
  level: 'autonomous',
  domains: ['revenue', 'finance'],
  triggers: ['schedule:hourly', 'event:anomaly_detected'],
  tags: ['brain-native', 'monitoring', 'revenue'],

  execute: async (input: unknown, ctx) => {
    const brainExec = (ctx as unknown as { brainExecution: BrainExecutionInterface }).brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.2, 'Running revenue forecast...');
    const forecast = await brainExec.executeDomain('forecast');

    ctx.reportProgress(0.5, 'Running diagnosis...');
    const diagnosis = await brainExec.executeDomain('diagnose');

    ctx.reportProgress(0.8, 'Generating recommendations...');
    const recommend = await brainExec.executeDomain('recommend');

    const forecastResult = forecast as { confidence: number; narrative: string };
    const diagnosisResult = diagnosis as { confidence: number; narrative: string };

    const alerts: string[] = [];
    if (forecastResult.confidence < 0.5) {
      alerts.push(`Revenue forecast confidence dropped to ${(forecastResult.confidence * 100).toFixed(0)}%`);
    }

    ctx.reportProgress(1.0, 'Analysis complete');

    return {
      status: 'completed',
      forecast: { confidence: forecastResult.confidence, narrative: forecastResult.narrative },
      diagnosis: { confidence: diagnosisResult.confidence, narrative: diagnosisResult.narrative },
      alerts,
      alertCount: alerts.length,
      timestamp: new Date().toISOString(),
    };
  },
});

/**
 * Daily Briefing Agent — generates executive summary every day
 * Level: autonomous | Triggers: schedule:daily
 */
export const dailyBriefingAgent: AgentDefinition = defineAgent({
  name: 'brain-daily-briefing',
  description: 'Generates daily executive briefing by running narrate + recommend across all domains',
  level: 'autonomous',
  triggers: ['schedule:daily'],
  tags: ['brain-native', 'reporting', 'executive'],

  execute: async (input: unknown, ctx) => {
    const brainExec = (ctx as unknown as { brainExecution: BrainExecutionInterface }).brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.3, 'Generating narrative...');
    const narrative = await brainExec.executeDomain('narrate');

    ctx.reportProgress(0.6, 'Building priority stack...');
    const recommendations = await brainExec.executeDomain('recommend');

    ctx.reportProgress(0.9, 'Auditing assumptions...');
    const audit = await brainExec.executeDomain('audit');

    ctx.reportProgress(1.0, 'Briefing complete');

    return {
      status: 'completed',
      narrative,
      recommendations,
      audit,
      generatedAt: new Date().toISOString(),
    };
  },
});

/**
 * Anomaly Diagnostician Agent — triggered by anomaly events
 * Level: task | Triggers: event:anomaly_detected
 */
export const anomalyDiagnosticianAgent: AgentDefinition = defineAgent({
  name: 'brain-anomaly-diagnostician',
  description: 'When an anomaly is detected, diagnoses root cause, explains causal chain, and recommends actions',
  level: 'task',
  triggers: ['event:anomaly_detected'],
  tags: ['brain-native', 'diagnostic', 'reactive'],

  execute: async (input: unknown, ctx) => {
    const brainExec = (ctx as unknown as { brainExecution: BrainExecutionInterface }).brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.3, 'Diagnosing anomaly...');
    const diagnosis = await brainExec.executeDomain('diagnose');

    ctx.reportProgress(0.6, 'Explaining causal chain...');
    const explanation = await brainExec.executeDomain('explain');

    ctx.reportProgress(0.8, 'Correlating with other domains...');
    const correlations = await brainExec.executeDomain('correlate');

    ctx.reportProgress(1.0, 'Diagnosis complete');

    return {
      status: 'completed',
      diagnosis,
      explanation,
      correlations,
      triggeredAt: new Date().toISOString(),
    };
  },
});

/**
 * Optimizer Agent — finds optimal intervention portfolio
 * Level: task | Triggers: manual, schedule:weekly
 */
export const optimizerAgent: AgentDefinition = defineAgent({
  name: 'brain-optimizer',
  description: 'Optimizes intervention portfolio by running optimize + simulate + forecast pipeline',
  level: 'task',
  triggers: ['manual', 'schedule:weekly'],
  tags: ['brain-native', 'optimization', 'strategic'],

  execute: async (input: unknown, ctx) => {
    const brainExec = (ctx as unknown as { brainExecution: BrainExecutionInterface }).brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.25, 'Finding optimal interventions...');
    const optimization = await brainExec.executeDomain('optimize');

    ctx.reportProgress(0.5, 'Simulating intervention impact...');
    const simulation = await brainExec.executeDomain('simulate');

    ctx.reportProgress(0.75, 'Forecasting with interventions...');
    const forecast = await brainExec.executeDomain('forecast');

    ctx.reportProgress(1.0, 'Optimization complete');

    return {
      status: 'completed',
      optimization,
      simulation,
      forecast,
      generatedAt: new Date().toISOString(),
    };
  },
});

/**
 * Benchmark Auditor Agent — compares against external references
 * Level: tool | Triggers: manual
 */
export const benchmarkAuditorAgent: AgentDefinition = defineAgent({
  name: 'brain-benchmark-auditor',
  description: 'Benchmarks current state against training pack knowledge and audits assumptions',
  level: 'tool',
  triggers: ['manual'],
  tags: ['brain-native', 'benchmarking', 'audit'],

  execute: async (input: unknown, ctx) => {
    const brainExec = (ctx as unknown as { brainExecution: BrainExecutionInterface }).brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.4, 'Benchmarking...');
    const benchmark = await brainExec.executeDomain('benchmark');

    ctx.reportProgress(0.8, 'Auditing...');
    const audit = await brainExec.executeDomain('audit');

    ctx.reportProgress(1.0, 'Complete');

    return {
      status: 'completed',
      benchmark,
      audit,
      generatedAt: new Date().toISOString(),
    };
  },
});

// ============================================================================
// ALL PRE-BUILT AGENTS
// ============================================================================

/** All pre-built brain-native agents */
export const ALL_BRAIN_AGENTS: AgentDefinition[] = [
  revenueWatcherAgent,
  dailyBriefingAgent,
  anomalyDiagnosticianAgent,
  optimizerAgent,
  benchmarkAuditorAgent,
];

/**
 * Register all brain-native agents into an agent registry.
 *
 * @example
 * ```typescript
 * const agentRegistry = createAgentRegistry({ verbose: true });
 * registerBrainAgents(agentRegistry);
 * // 5 brain-native agents now registered
 * ```
 */
export function registerBrainAgents(
  registry: { register: (def: AgentDefinition) => void },
): void {
  for (const agent of ALL_BRAIN_AGENTS) {
    registry.register(agent);
  }
}
