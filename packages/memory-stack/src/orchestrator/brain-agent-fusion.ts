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
import {
  jarvisOrchestratorAgent,
  jarvisAnalystAgent,
  jarvisMonitorAgent,
  ALL_JARVIS_AGENTS,
  registerJarvisAgents,
} from './agents-jarvis';

import {
  brainRevenueSyncAgent,
  brainEngineeringSyncAgent,
  brainCommunicationSyncAgent,
  brainOperationsSyncAgent,
  brainProductivitySyncAgent,
  ALL_CONNECTOR_SYNC_AGENTS,
  registerConnectorSyncAgents,
} from './agents-connector-sync';

import {
  devJarvisAgent,
  ALL_DEV_JARVIS_AGENTS,
  registerDevJarvisAgents,
} from './agents-dev-jarvis';

// Re-export Jarvis for convenience
export {
  jarvisOrchestratorAgent,
  jarvisAnalystAgent,
  jarvisMonitorAgent,
  ALL_JARVIS_AGENTS,
  registerJarvisAgents,
} from './agents-jarvis';

export type {
  JarvisGoal,
  JarvisResult,
  JarvisFinding,
  JarvisAction,
  JarvisMonitorResult,
} from './agents-jarvis';

// Re-export Connector Sync agents
export {
  brainRevenueSyncAgent,
  brainEngineeringSyncAgent,
  brainCommunicationSyncAgent,
  brainOperationsSyncAgent,
  brainProductivitySyncAgent,
  ALL_CONNECTOR_SYNC_AGENTS,
  registerConnectorSyncAgents,
  type ConnectorSyncInput,
  type ConnectorSyncOutput,
} from './agents-connector-sync';

// Re-export Dev Jarvis agent
export {
  devJarvisAgent,
  ALL_DEV_JARVIS_AGENTS,
  registerDevJarvisAgents,
  type DevJarvisGoal,
  type DevJarvisResult,
} from './agents-dev-jarvis';

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
    const brainExec = ctx.brainExecution;
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
    const brainExec = ctx.brainExecution;
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
    const brainExec = ctx.brainExecution;
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
    const brainExec = ctx.brainExecution;
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
    const brainExec = ctx.brainExecution;
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
// V6.1 PRE-BUILT AGENTS — Advanced Brain Cognition
// ============================================================================

/**
 * Risk Sentinel Agent — continuous risk cascade monitoring
 * Level: autonomous | Triggers: schedule:6h, event:anomaly_detected
 */
export const riskSentinelAgent: AgentDefinition = defineAgent({
  name: 'brain-risk-sentinel',
  description: 'Monitors organizational risk posture by running risk-cascade + anomaly-predict + sentiment, triggers alerts on systemic risk escalation',
  level: 'autonomous',
  domains: ['risk', 'operations'],
  triggers: ['schedule:6h', 'event:anomaly_detected', 'event:metric_threshold_breached'],
  tags: ['brain-native', 'risk', 'sentinel', 'v6.1'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.2, 'Scanning risk cascades...');
    const riskCascade = await brainExec.executeDomain('risk-cascade');

    ctx.reportProgress(0.5, 'Predicting anomalies...');
    const anomalyPredict = await brainExec.executeDomain('anomaly-predict');

    ctx.reportProgress(0.75, 'Reading organizational sentiment...');
    const sentiment = await brainExec.executeDomain('sentiment');

    ctx.reportProgress(1.0, 'Risk assessment complete');

    const riskResult = riskCascade as { systemicRiskScore?: number; singlePointsOfFailure?: unknown[] };
    const anomalyResult = anomalyPredict as { criticalCount?: number; predictedAnomalies?: unknown[] };
    const sentimentResult = sentiment as { overallMood?: string };

    const alerts: string[] = [];
    if ((riskResult.systemicRiskScore || 0) > 0.6) alerts.push(`Systemic risk elevated: ${((riskResult.systemicRiskScore || 0) * 100).toFixed(0)}%`);
    if ((anomalyResult.criticalCount || 0) > 0) alerts.push(`${anomalyResult.criticalCount} critical anomalies predicted`);
    if (sentimentResult.overallMood === 'fear') alerts.push('Organizational sentiment: FEAR — risk of panic-driven decisions');

    return {
      status: 'completed',
      riskCascade: { systemicRiskScore: riskResult.systemicRiskScore, singlePoints: (riskResult.singlePointsOfFailure || []).length },
      anomalyPredict: { criticalCount: anomalyResult.criticalCount, totalPredicted: (anomalyResult.predictedAnomalies || []).length },
      sentiment: { overallMood: sentimentResult.overallMood },
      alerts,
      alertCount: alerts.length,
      riskLevel: alerts.length > 2 ? 'critical' : alerts.length > 0 ? 'elevated' : 'normal',
      timestamp: new Date().toISOString(),
    };
  },
});

/**
 * Strategic Planner Agent — builds comprehensive strategic plans
 * Level: task | Triggers: manual, event:quarter_start
 */
export const strategicPlannerAgent: AgentDefinition = defineAgent({
  name: 'brain-strategic-planner',
  description: 'Builds end-to-end strategic plans by decomposing goals, allocating resources, identifying interventions, and mapping scenarios',
  level: 'task',
  domains: ['strategy', 'finance', 'growth'],
  triggers: ['manual', 'event:quarter_start'],
  tags: ['brain-native', 'strategic', 'planning', 'v6.1'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.15, 'Decomposing goals...');
    const goalPlan = await brainExec.executeDomain('goal-decompose');

    ctx.reportProgress(0.35, 'Finding precision interventions...');
    const intervention = await brainExec.executeDomain('causal-intervene');

    ctx.reportProgress(0.55, 'Allocating resources...');
    const allocation = await brainExec.executeDomain('resource-allocate');

    ctx.reportProgress(0.75, 'Building scenario tree...');
    const scenarios = await brainExec.executeDomain('scenario-tree');

    ctx.reportProgress(0.9, 'Generating narrative...');
    const narrative = await brainExec.executeDomain('narrate');

    ctx.reportProgress(1.0, 'Strategic plan complete');

    return {
      status: 'completed',
      goalPlan,
      intervention,
      allocation,
      scenarios,
      narrative,
      generatedAt: new Date().toISOString(),
    };
  },
});

/**
 * Pattern Reconnaissance Agent — deep temporal pattern scanning
 * Level: autonomous | Triggers: schedule:daily, event:signal_ingested
 */
export const patternReconAgent: AgentDefinition = defineAgent({
  name: 'brain-pattern-recon',
  description: 'Scans all domains for temporal patterns, regime shifts, and seasonal cycles — builds the brain pattern memory library',
  level: 'autonomous',
  triggers: ['schedule:daily', 'event:signal_ingested'],
  tags: ['brain-native', 'pattern-recognition', 'temporal', 'v6.1'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.3, 'Scanning pattern memory...');
    const patterns = await brainExec.executeDomain('pattern-memory');

    ctx.reportProgress(0.6, 'Cross-domain correlation...');
    const correlations = await brainExec.executeDomain('correlate');

    ctx.reportProgress(0.9, 'Anomaly prediction from patterns...');
    const predictions = await brainExec.executeDomain('anomaly-predict');

    ctx.reportProgress(1.0, 'Pattern reconnaissance complete');

    return {
      status: 'completed',
      patterns,
      correlations,
      predictions,
      scanCompletedAt: new Date().toISOString(),
    };
  },
});

/**
 * Organizational Health Agent — holistic org wellness check
 * Level: autonomous | Triggers: schedule:weekly
 */
export const orgHealthAgent: AgentDefinition = defineAgent({
  name: 'brain-org-health',
  description: 'Weekly organizational health check — sentiment analysis + risk assessment + benchmark comparison + recommendation stack',
  level: 'autonomous',
  triggers: ['schedule:weekly'],
  tags: ['brain-native', 'health-check', 'executive', 'v6.1'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.2, 'Reading organizational sentiment...');
    const sentiment = await brainExec.executeDomain('sentiment');

    ctx.reportProgress(0.4, 'Assessing risk posture...');
    const risk = await brainExec.executeDomain('risk-cascade');

    ctx.reportProgress(0.6, 'Benchmarking...');
    const benchmark = await brainExec.executeDomain('benchmark');

    ctx.reportProgress(0.8, 'Building recommendations...');
    const recommendations = await brainExec.executeDomain('recommend');

    ctx.reportProgress(1.0, 'Health check complete');

    return {
      status: 'completed',
      sentiment,
      risk,
      benchmark,
      recommendations,
      healthCheckAt: new Date().toISOString(),
    };
  },
});

/**
 * Intervention Tracker Agent — follows up on executed interventions
 * Level: task | Triggers: schedule:weekly, event:intervention_executed
 */
export const interventionTrackerAgent: AgentDefinition = defineAgent({
  name: 'brain-intervention-tracker',
  description: 'Tracks executed interventions — checks if the causal lever moved, measures actual vs predicted impact, feeds results back to brain calibration',
  level: 'task',
  triggers: ['schedule:weekly', 'event:intervention_executed'],
  tags: ['brain-native', 'tracking', 'closed-loop', 'v6.1'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.25, 'Re-evaluating causal interventions...');
    const currentIntervention = await brainExec.executeDomain('causal-intervene');

    ctx.reportProgress(0.5, 'Checking forecast accuracy...');
    const forecast = await brainExec.executeDomain('forecast');

    ctx.reportProgress(0.75, 'Auditing assumptions...');
    const audit = await brainExec.executeDomain('audit');

    ctx.reportProgress(1.0, 'Intervention tracking complete');

    return {
      status: 'completed',
      currentIntervention,
      forecast,
      audit,
      trackedAt: new Date().toISOString(),
    };
  },
});

// ============================================================================
// V7 — ACCOUNTING INTELLIGENCE AGENTS
// ============================================================================

/**
 * Balance Sheet Builder Agent — orchestrates full BS generation
 * Level: task | Triggers: event:period_close, command:build_balance_sheet
 */
export const balanceSheetBuilderAgent: AgentDefinition = defineAgent({
  name: 'brain-balance-sheet-builder',
  description: 'Orchestrates end-to-end balance sheet generation — comprehends documents, checks completeness, applies rules, cross-validates, synthesizes the statement, and triages confidence',
  level: 'task',
  triggers: ['event:period_close', 'command:build_balance_sheet'],
  tags: ['brain-native', 'accounting', 'balance-sheet', 'v7'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.1, 'Comprehending financial documents...');
    const documents = await brainExec.executeDomain('document-comprehend');

    ctx.reportProgress(0.25, 'Checking data completeness...');
    const completeness = await brainExec.executeDomain('completeness-check');

    ctx.reportProgress(0.4, 'Applying accounting rules...');
    const rules = await brainExec.executeDomain('rule-apply');

    ctx.reportProgress(0.6, 'Cross-validating balances...');
    const validation = await brainExec.executeDomain('cross-validate');

    ctx.reportProgress(0.8, 'Synthesizing balance sheet...');
    const statement = await brainExec.executeDomain('statement-synthesize');

    ctx.reportProgress(0.95, 'Triaging confidence...');
    const triage = await brainExec.executeDomain('confidence-triage');

    ctx.reportProgress(1.0, 'Balance sheet complete');

    return {
      status: 'completed',
      statementType: 'balance_sheet',
      documents,
      completeness,
      rules,
      validation,
      statement,
      triage,
      generatedAt: new Date().toISOString(),
    };
  },
});

/**
 * P&L Builder Agent — orchestrates full Income Statement generation
 * Level: task | Triggers: event:period_close, command:build_pnl
 */
export const pnlBuilderAgent: AgentDefinition = defineAgent({
  name: 'brain-pnl-builder',
  description: 'Orchestrates end-to-end P&L (Income Statement) generation — comprehends documents, checks completeness, applies revenue recognition rules, synthesizes the statement, cross-validates, and triages',
  level: 'task',
  triggers: ['event:period_close', 'command:build_pnl'],
  tags: ['brain-native', 'accounting', 'pnl', 'income-statement', 'v7'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.1, 'Comprehending revenue & expense documents...');
    const documents = await brainExec.executeDomain('document-comprehend');

    ctx.reportProgress(0.25, 'Checking P&L data completeness...');
    const completeness = await brainExec.executeDomain('completeness-check');

    ctx.reportProgress(0.4, 'Applying revenue recognition & expense rules...');
    const rules = await brainExec.executeDomain('rule-apply');

    ctx.reportProgress(0.6, 'Synthesizing income statement...');
    const statement = await brainExec.executeDomain('statement-synthesize');

    ctx.reportProgress(0.8, 'Cross-validating P&L figures...');
    const validation = await brainExec.executeDomain('cross-validate');

    ctx.reportProgress(0.95, 'Triaging confidence levels...');
    const triage = await brainExec.executeDomain('confidence-triage');

    ctx.reportProgress(1.0, 'P&L complete');

    return {
      status: 'completed',
      statementType: 'income_statement',
      documents,
      completeness,
      rules,
      statement,
      validation,
      triage,
      generatedAt: new Date().toISOString(),
    };
  },
});

/**
 * Cash Flow Builder Agent — orchestrates Cash Flow Statement generation
 * Level: task | Triggers: event:period_close, command:build_cashflow
 */
export const cashflowBuilderAgent: AgentDefinition = defineAgent({
  name: 'brain-cashflow-builder',
  description: 'Orchestrates cash flow statement generation — comprehends cash movements, checks completeness, applies classification rules, synthesizes operating/investing/financing activities',
  level: 'task',
  triggers: ['event:period_close', 'command:build_cashflow'],
  tags: ['brain-native', 'accounting', 'cashflow', 'v7'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.15, 'Comprehending cash movement documents...');
    const documents = await brainExec.executeDomain('document-comprehend');

    ctx.reportProgress(0.3, 'Checking cash flow data completeness...');
    const completeness = await brainExec.executeDomain('completeness-check');

    ctx.reportProgress(0.5, 'Applying cash classification rules...');
    const rules = await brainExec.executeDomain('rule-apply');

    ctx.reportProgress(0.7, 'Synthesizing cash flow statement...');
    const statement = await brainExec.executeDomain('statement-synthesize');

    ctx.reportProgress(0.85, 'Cross-validating cash movements...');
    const validation = await brainExec.executeDomain('cross-validate');

    ctx.reportProgress(1.0, 'Cash flow statement complete');

    return {
      status: 'completed',
      statementType: 'cash_flow',
      documents,
      completeness,
      rules,
      statement,
      validation,
      generatedAt: new Date().toISOString(),
    };
  },
});

/**
 * Tax Preparer Agent — multi-jurisdiction tax preparation
 * Level: task | Triggers: event:tax_deadline_approaching, command:prepare_tax
 */
export const taxPreparerAgent: AgentDefinition = defineAgent({
  name: 'brain-tax-preparer',
  description: 'Multi-jurisdiction tax preparation — applies tax rules per jurisdiction, checks compliance, cross-validates tax computations, verifies completeness of required forms',
  level: 'task',
  triggers: ['event:tax_deadline_approaching', 'command:prepare_tax'],
  tags: ['brain-native', 'accounting', 'tax', 'multi-jurisdiction', 'v7'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.15, 'Applying jurisdiction-specific tax rules...');
    const rules = await brainExec.executeDomain('rule-apply');

    ctx.reportProgress(0.35, 'Running multi-jurisdiction compliance check...');
    const compliance = await brainExec.executeDomain('jurisdiction-comply');

    ctx.reportProgress(0.55, 'Cross-validating tax computations...');
    const validation = await brainExec.executeDomain('cross-validate');

    ctx.reportProgress(0.75, 'Checking filing completeness...');
    const completeness = await brainExec.executeDomain('completeness-check');

    ctx.reportProgress(0.9, 'Triaging tax positions...');
    const triage = await brainExec.executeDomain('confidence-triage');

    ctx.reportProgress(1.0, 'Tax preparation complete');

    return {
      status: 'completed',
      prepType: 'multi_jurisdiction_tax',
      rules,
      compliance,
      validation,
      completeness,
      triage,
      preparedAt: new Date().toISOString(),
    };
  },
});

/**
 * Multi-Jurisdiction Monitor Agent — autonomous daily compliance dashboard
 * Level: autonomous | Triggers: schedule:24h, event:regulation_change
 */
export const multiJurisdictionMonitorAgent: AgentDefinition = defineAgent({
  name: 'brain-multi-jurisdiction-monitor',
  description: 'Autonomous multi-jurisdiction compliance monitor — daily scan of all active jurisdictions for compliance gaps, filing deadlines, and regulatory changes',
  level: 'autonomous',
  triggers: ['schedule:24h', 'event:regulation_change', 'event:new_jurisdiction_added'],
  tags: ['brain-native', 'accounting', 'compliance', 'monitor', 'autonomous', 'v7'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.3, 'Scanning all jurisdictions for compliance...');
    const compliance = await brainExec.executeDomain('jurisdiction-comply');

    ctx.reportProgress(0.6, 'Checking filing completeness across jurisdictions...');
    const completeness = await brainExec.executeDomain('completeness-check');

    ctx.reportProgress(0.9, 'Triaging compliance priorities...');
    const triage = await brainExec.executeDomain('confidence-triage');

    ctx.reportProgress(1.0, 'Multi-jurisdiction scan complete');

    return {
      status: 'completed',
      monitorType: 'multi_jurisdiction_compliance',
      compliance,
      completeness,
      triage,
      scannedAt: new Date().toISOString(),
      nextScan: '24h',
    };
  },
});

/**
 * Financial Auditor Agent — comprehensive audit execution
 * Level: task | Triggers: command:run_audit, event:period_close
 */
export const financialAuditorAgent: AgentDefinition = defineAgent({
  name: 'brain-financial-auditor',
  description: 'Runs comprehensive financial audit — checks completeness, cross-validates all accounts, applies rules, verifies jurisdiction compliance, and triages findings by materiality',
  level: 'task',
  triggers: ['command:run_audit', 'event:period_close'],
  tags: ['brain-native', 'accounting', 'audit', 'compliance', 'v7'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.1, 'Checking data completeness...');
    const completeness = await brainExec.executeDomain('completeness-check');

    ctx.reportProgress(0.3, 'Cross-validating all accounts...');
    const validation = await brainExec.executeDomain('cross-validate');

    ctx.reportProgress(0.5, 'Applying accounting & tax rules...');
    const rules = await brainExec.executeDomain('rule-apply');

    ctx.reportProgress(0.7, 'Verifying jurisdiction compliance...');
    const compliance = await brainExec.executeDomain('jurisdiction-comply');

    ctx.reportProgress(0.9, 'Triaging audit findings by materiality...');
    const triage = await brainExec.executeDomain('confidence-triage');

    ctx.reportProgress(1.0, 'Financial audit complete');

    return {
      status: 'completed',
      auditType: 'comprehensive_financial',
      completeness,
      validation,
      rules,
      compliance,
      triage,
      auditedAt: new Date().toISOString(),
    };
  },
});

// ============================================================================
// V8 — METACOGNITION + SELF-IMPROVEMENT AGENTS
// ============================================================================

/**
 * Metacognition Auditor Agent — the brain examining itself
 * Brain Analog: Retrosplenial Cortex → Anterior Cingulate → Supplementary Motor Area
 * Level: autonomous | Triggers: schedule:weekly, event:predictions_resolved
 *
 * Weekly "Brain Health Report" — calibration drift, systematic biases, performance degradation.
 * This agent IS the introspection loop: it asks "how accurate have I been?" and "why was I wrong?"
 */
export const metacognitionAuditorAgent: AgentDefinition = defineAgent({
  name: 'brain-metacognition-auditor',
  description: 'Weekly metacognitive audit — runs calibration-audit → error-attribute → execution-profile to produce a Brain Health Report with calibration drift, systematic biases, and performance degradation analysis',
  level: 'autonomous',
  domains: ['calibration', 'metacognition', 'performance'],
  triggers: ['schedule:weekly', 'event:predictions_resolved'],
  tags: ['brain-native', 'metacognition', 'self-improvement', 'v8'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.15, 'Running calibration audit — how accurate have I been?');
    const calibration = await brainExec.executeDomain('calibration-audit');
    const calResult = calibration as { brierScore?: number; calibrationBias?: string; recalibrationAdjustments?: unknown[] };

    ctx.reportProgress(0.45, 'Attributing errors — why was I wrong?');
    const errorAttribution = await brainExec.executeDomain('error-attribute');
    const errResult = errorAttribution as { errorBreakdown?: Record<string, number>; corrections?: unknown[] };

    ctx.reportProgress(0.75, 'Profiling execution performance — how efficient am I?');
    const profile = await brainExec.executeDomain('execution-profile');

    ctx.reportProgress(1.0, 'Brain Health Report complete');

    // Determine health grade
    const brierScore = calResult.brierScore || 0;
    const healthGrade = brierScore < 0.1 ? 'A' : brierScore < 0.2 ? 'B' : brierScore < 0.35 ? 'C' : 'D';
    const alerts: string[] = [];
    if (brierScore > 0.25) alerts.push(`Calibration degraded — Brier score ${brierScore.toFixed(3)}`);
    if (calResult.calibrationBias === 'overconfident') alerts.push('Systematic overconfidence detected — recalibration recommended');
    if ((calResult.recalibrationAdjustments || []).length > 3) alerts.push(`${(calResult.recalibrationAdjustments || []).length} domains need recalibration`);

    return {
      status: 'completed',
      reportType: 'brain_health',
      healthGrade,
      calibration: { brierScore: calResult.brierScore, bias: calResult.calibrationBias, adjustments: (calResult.recalibrationAdjustments || []).length },
      errorAttribution: { breakdown: errResult.errorBreakdown, corrections: (errResult.corrections || []).length },
      performance: profile,
      alerts,
      alertCount: alerts.length,
      generatedAt: new Date().toISOString(),
    };
  },
});

/**
 * Quality Gate Agent — post-execution quality validation
 * Brain Analog: Dorsomedial PFC → Orbitofrontal → Thalamic Reticular Nucleus
 * Level: task | Triggers: event:domain_executed, manual
 *
 * After any brain execution, this agent validates: Are composed results consistent?
 * Is the uncertainty decomposed? Are conclusions fragile? Produces a quality score
 * and a pass/fail gate decision.
 */
export const qualityGateAgent: AgentDefinition = defineAgent({
  name: 'brain-quality-gate',
  description: 'Post-execution quality gate — runs chain-validate → uncertainty-quantify → robustness-check to produce a qualityScore (0-1) and passesGate boolean',
  level: 'task',
  domains: ['validation', 'metacognition', 'quality'],
  triggers: ['event:domain_executed', 'manual'],
  tags: ['brain-native', 'metacognition', 'quality-gate', 'v8'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.2, 'Validating chain consistency — do results contradict?');
    const chainValidation = await brainExec.executeDomain('chain-validate');
    const chainResult = chainValidation as { consistencyScore?: number; contradictions?: unknown[] };

    ctx.reportProgress(0.5, 'Decomposing uncertainty — what do we know vs not know?');
    const uncertainty = await brainExec.executeDomain('uncertainty-quantify');
    const uncResult = uncertainty as { epistemicUncertainty?: number; aleatoricUncertainty?: number; dataGaps?: unknown[] };

    ctx.reportProgress(0.8, 'Testing robustness — are conclusions fragile?');
    const robustness = await brainExec.executeDomain('robustness-check');
    const robResult = robustness as { robustnessScore?: number; fragileEdges?: unknown[] };

    ctx.reportProgress(1.0, 'Quality gate evaluation complete');

    // Compute composite quality score (weighted average)
    const consistencyScore = chainResult.consistencyScore || 0.5;
    const robustnessScore = robResult.robustnessScore || 0.5;
    const knowledgeCoverage = 1 - (uncResult.epistemicUncertainty || 0.5);

    const qualityScore = (consistencyScore * 0.4) + (robustnessScore * 0.35) + (knowledgeCoverage * 0.25);
    const passesGate = qualityScore >= 0.6;

    const issues: string[] = [];
    if (consistencyScore < 0.7) issues.push(`Chain inconsistency: ${(chainResult.contradictions || []).length} contradictions`);
    if (robustnessScore < 0.5) issues.push(`Fragile conclusions: ${(robResult.fragileEdges || []).length} fragile edges`);
    if ((uncResult.epistemicUncertainty || 0) > 0.6) issues.push(`High epistemic uncertainty: ${(uncResult.dataGaps || []).length} data gaps`);

    return {
      status: 'completed',
      qualityScore: Math.round(qualityScore * 1000) / 1000,
      passesGate,
      gateThreshold: 0.6,
      breakdown: {
        consistency: consistencyScore,
        robustness: robustnessScore,
        knowledgeCoverage,
      },
      issues,
      issueCount: issues.length,
      evaluatedAt: new Date().toISOString(),
    };
  },
});

/**
 * Continuous Learner Agent — closes the learning loop
 * Brain Analog: Retrosplenial Cortex → Anterior Cingulate → Hippocampal Pattern Memory
 * Level: autonomous | Triggers: schedule:daily, event:outcome_recorded
 *
 * When outcomes arrive: attribute errors → identify failure patterns → generate
 * recalibration adjustments. This agent IS the closed-loop learning system.
 */
export const continuousLearnerAgent: AgentDefinition = defineAgent({
  name: 'brain-continuous-learner',
  description: 'Closes the learning loop — when outcomes arrive, runs calibration-audit → error-attribute → pattern-memory to identify failure patterns and generate recalibration adjustments',
  level: 'autonomous',
  domains: ['learning', 'metacognition', 'calibration'],
  triggers: ['schedule:daily', 'event:outcome_recorded'],
  tags: ['brain-native', 'metacognition', 'learning', 'closed-loop', 'v8'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    ctx.reportProgress(0.15, 'Auditing prediction calibration...');
    const calibration = await brainExec.executeDomain('calibration-audit');
    const calResult = calibration as { brierScore?: number; recalibrationAdjustments?: unknown[]; learningVelocity?: number };

    ctx.reportProgress(0.4, 'Attributing prediction errors...');
    const errors = await brainExec.executeDomain('error-attribute');
    const errResult = errors as { errorBreakdown?: Record<string, number>; failureMode?: string; corrections?: unknown[] };

    ctx.reportProgress(0.7, 'Scanning for failure patterns in memory...');
    const patterns = await brainExec.executeDomain('pattern-memory');
    const patResult = patterns as { patternsFound?: number; significantPatterns?: unknown[] };

    ctx.reportProgress(1.0, 'Learning cycle complete');

    // Determine if meaningful learning occurred
    const adjustmentCount = (calResult.recalibrationAdjustments || []).length;
    const correctionCount = (errResult.corrections || []).length;
    const patternsFound = patResult.patternsFound || 0;
    const learningOccurred = adjustmentCount > 0 || correctionCount > 0 || patternsFound > 0;

    return {
      status: 'completed',
      learningCycle: {
        learningOccurred,
        learningVelocity: calResult.learningVelocity || 0,
        adjustments: adjustmentCount,
        corrections: correctionCount,
        newPatterns: patternsFound,
      },
      calibration: { brierScore: calResult.brierScore },
      dominantFailureMode: errResult.failureMode || 'none',
      nextActions: learningOccurred
        ? ['Apply recalibration adjustments', 'Update failure pattern library', 'Notify metacognition auditor']
        : ['No learning needed — brain is well-calibrated'],
      learnedAt: new Date().toISOString(),
    };
  },
});

// ============================================================================
// V9 — Accounting Intelligence Pro Agent (Amygdala-Causal Integration)
// ============================================================================

/**
 * Causal Accountant Agent — the agent that proves NexusBrain adds value over pure LLM
 * Brain Analog: Amygdala-Causal Integration Cortex — threat detection via causal analysis
 * Level: autonomous | Triggers: event:accounting_executed, schedule:daily
 *
 * This agent IS Isabel's Req 2 — it does standard accounting (bookkeeping, reconciliation)
 * THEN overlays NexusBrain's causal analysis to spot anomalies that no pure LLM can detect.
 */
export const brainCausalAccountantAgent: AgentDefinition = defineAgent({
  name: 'brain-causal-accountant',
  description: 'Does standard accounting then overlays NexusBrain causal analysis — bookkeep → reconcile → detect causal anomalies → triage. The agent that proves NexusBrain adds value.',
  level: 'autonomous',
  domains: ['accounting', 'bookkeeping', 'reconciliation', 'causal', 'anomaly-detection'],
  triggers: ['event:accounting_executed', 'schedule:daily'],
  tags: ['brain-native', 'accounting', 'causal', 'v9'],

  execute: async (input: unknown, ctx) => {
    const brainExec = ctx.brainExecution;
    if (!brainExec) {
      return { status: 'skipped', reason: 'Brain execution interface not available' };
    }

    // Phase 1: Standard Accounting (Req 1)
    ctx.reportProgress(0.15, 'Creating journal entries with double-entry bookkeeping...');
    const bookkeeping = await brainExec.executeDomain('double-entry-bookkeep');
    const bookResult = bookkeeping as { doubleEntryScore?: number; trialBalance?: { isBalanced?: boolean } };

    ctx.reportProgress(0.35, 'Reconciling account balances...');
    const reconciliation = await brainExec.executeDomain('reconcile-accounts');
    const reconResult = reconciliation as { reconciliationScore?: number; monthEndReady?: boolean; unmatchedItems?: unknown[] };

    // Phase 2: NexusBrain Causal Layer (Req 2 — what makes us different)
    ctx.reportProgress(0.60, 'Running NexusBrain causal anomaly detection...');
    const causalAnalysis = await brainExec.executeDomain('causal-anomaly-detect');
    const causalResult = causalAnalysis as { causalAnomalies?: unknown[]; riskScore?: number; brainValueAdd?: string };

    // Phase 3: Triage and prioritize findings
    ctx.reportProgress(0.85, 'Triaging findings by materiality...');
    const triage = await brainExec.executeDomain('confidence-triage');
    const triageResult = triage as { triageResults?: unknown[]; materialityThreshold?: number };

    ctx.reportProgress(1.0, 'Causal accounting analysis complete');

    const anomalyCount = (causalResult.causalAnomalies || []).length;
    const hasBookkeepingIssues = (bookResult.doubleEntryScore || 0) < 0.95;
    const hasReconciliationIssues = (reconResult.unmatchedItems || []).length > 0;
    const hasCausalAnomalies = anomalyCount > 0;

    return {
      status: 'completed',
      // Req 1: Can the AI do accounting?
      accountingKnowledge: {
        doubleEntryScore: bookResult.doubleEntryScore || 0,
        trialBalanced: bookResult.trialBalance?.isBalanced || false,
        reconciliationScore: reconResult.reconciliationScore || 0,
        monthEndReady: reconResult.monthEndReady || false,
        unmatchedItems: (reconResult.unmatchedItems || []).length,
      },
      // Req 2: Does NexusBrain add value?
      brainCausalValue: {
        anomaliesDetected: anomalyCount,
        riskScore: causalResult.riskScore || 0,
        brainValueAdd: causalResult.brainValueAdd || 'No causal analysis available',
        whatPureLLMMisses: hasCausalAnomalies
          ? `${anomalyCount} causal anomalies detected — these are invisible to any pure LLM agent without a causal graph`
          : 'All causal relationships holding — brain confirms data consistency',
      },
      // Combined assessment
      overallAssessment: {
        hasIssues: hasBookkeepingIssues || hasReconciliationIssues || hasCausalAnomalies,
        issueBreakdown: {
          bookkeeping: hasBookkeepingIssues,
          reconciliation: hasReconciliationIssues,
          causalAnomalies: hasCausalAnomalies,
        },
        materialityThreshold: triageResult.materialityThreshold || 0,
      },
      analyzedAt: new Date().toISOString(),
    };
  },
});

// ============================================================================
// ALL PRE-BUILT AGENTS
// ============================================================================

/** All 29 pre-built brain-native agents (V6:5 + V6.1:5 + V7:6 + V8 Jarvis:3 + V8 ConnectorSync:5 + V8 Metacognition:3 + V8 DevJarvis:1 + V9 Accounting:1) */
export const ALL_BRAIN_AGENTS: AgentDefinition[] = [
  // V6 — Core Brain Agents (Cerebral Cortex)
  revenueWatcherAgent,
  dailyBriefingAgent,
  anomalyDiagnosticianAgent,
  optimizerAgent,
  benchmarkAuditorAgent,
  // V6.1 — Advanced Brain Agents (Limbic + Prefrontal)
  riskSentinelAgent,
  strategicPlannerAgent,
  patternReconAgent,
  orgHealthAgent,
  interventionTrackerAgent,
  // V7 — Accounting Intelligence Agents (Temporal Lobe)
  balanceSheetBuilderAgent,
  pnlBuilderAgent,
  cashflowBuilderAgent,
  taxPreparerAgent,
  multiJurisdictionMonitorAgent,
  financialAuditorAgent,
  // V8 — Jarvis Executive Intelligence (Frontal Executive)
  ...ALL_JARVIS_AGENTS,
  // V8 — Connector Sync (Thalamus Relay Nuclei)
  ...ALL_CONNECTOR_SYNC_AGENTS,
  // V8 — Metacognition + Self-Improvement (Metacognitive Loop)
  metacognitionAuditorAgent,
  qualityGateAgent,
  continuousLearnerAgent,
  // V8 — Dev Jarvis (Developer Intelligence Executive)
  ...ALL_DEV_JARVIS_AGENTS,
  // V9 — Accounting Intelligence Pro (Amygdala-Causal Integration)
  brainCausalAccountantAgent,
];

/**
 * Register all 29 brain-native agents into an agent registry.
 * V6 core (5) + V6.1 advanced (5) + V7 accounting (6) +
 * V8 Jarvis (3) + V8 connector sync (5) + V8 metacognition (3) + V8 Dev Jarvis (1) + V9 accounting pro (1).
 *
 * @example
 * ```typescript
 * const agentRegistry = createAgentRegistry({ verbose: true });
 * registerBrainAgents(agentRegistry);
 * // 29 brain-native agents now registered
 * ```
 */
export function registerBrainAgents(
  registry: { register: (def: AgentDefinition) => void },
): void {
  for (const agent of ALL_BRAIN_AGENTS) {
    registry.register(agent);
  }
}
