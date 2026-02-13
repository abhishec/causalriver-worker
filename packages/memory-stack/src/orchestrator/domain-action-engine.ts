/**
 * Domain Action Engine — Motor Cortex
 * ====================================
 *
 * Brain Analog: The Motor Cortex translates frontal lobe intentions into
 * coordinated muscle movements that produce observable output. Without it,
 * the brain can THINK but cannot ACT.
 *
 * NexusBrain had 7 broken connections — powerful execution modules (temporal
 * forecaster, what-if simulator, explanation generator, context-aware reasoner)
 * that existed as architectural islands, never called from user-facing paths.
 *
 * This module WIRES them together:
 *
 *   User Intent → Action Router → Execution Module → Structured Artifact
 *
 * 4 Action Types:
 *   "forecast"  → temporal-forecaster + context-aware-reasoner → ForecastArtifact
 *   "simulate"  → whatif-simulator                             → SimulationArtifact
 *   "explain"   → context-aware-reasoner + explanation-generator → ExplanationArtifact
 *   "diagnose"  → context-aware-reasoner (anomaly) + rules     → DiagnosisArtifact
 *
 * Design Principles:
 *   - Pure wiring: NO new computation. Every handler calls existing modules.
 *   - Graceful degradation: Failures return degraded artifacts, never throw.
 *   - 60s lazy cache: DAG + TimeSeries loaded once per minute.
 *   - Domain-extensible: New action types can be added without touching existing ones.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CausalDAG } from '../causality/continuous-learner';
import type { DailyTimeSeries } from '../causality/signal-to-timeseries';
import type { ForecastResult, ForecastPoint } from '../causality/temporal-forecaster';
import type { SimulationResult, WhatIfScenario, CascadeStep, SimulationIntervention } from './whatif-simulator';
import type { ConnectionAnalysis } from '../causality/context-aware-reasoner';
import type { ExplanationChain, AnomalyExplanation } from '../causality/explanation-generator';
import { loadDAGFromDatabase } from '../causality/continuous-learner';
import { signalsToTimeSeries } from '../causality/signal-to-timeseries';
import { createContextAwareReasoner } from '../causality/context-aware-reasoner';
import { createTemporalForecaster } from '../causality/temporal-forecaster';
import { createWhatIfSimulator } from './whatif-simulator';
import { createExplanationGenerator } from '../causality/explanation-generator';

// ============================================================================
// TYPES
// ============================================================================

/** The 4 action classes the engine can execute */
export type ActionType = 'forecast' | 'simulate' | 'explain' | 'diagnose';

/** User intent from brain-knowledge-context.ts */
export type UserIntent = 'build' | 'explain' | 'diagnose' | 'predict' | 'general';

// ── Artifact Output Types ──────────────────────────────────────────────

/** Top-level artifact envelope — every action produces one of these */
export interface ActionArtifact {
  /** Which action was executed */
  actionType: ActionType;
  /** The primary domain targeted */
  domain: string;
  /** Machine-readable structured data for frontend rendering */
  data: ForecastArtifact | SimulationArtifact | ExplanationArtifact | DiagnosisArtifact;
  /** Natural language narrative explaining the artifact */
  narrative: string;
  /** Confidence in the overall result (0-1) */
  confidence: number;
  /** Execution timing in ms */
  durationMs: number;
  /** Metadata for audit trail */
  metadata: {
    modulesUsed: string[];
    dagNodeCount: number;
    dagEdgeCount: number;
    timeSeriesDomainsLoaded: number;
    executedAt: string;
  };
}

export interface ForecastArtifact {
  type: 'forecast';
  /** The full forecast result from temporal-forecaster */
  forecast: ForecastResult;
  /** Connection analyses for top causal drivers */
  driverAnalyses: ConnectionAnalysis[];
  /** Tabular data ready for frontend rendering */
  table: Array<{
    date: string;
    predicted: number;
    lower95: number;
    upper95: number;
  }>;
  /** Key upstream drivers with their weights */
  drivers: Array<{
    domain: string;
    weight: number;
    lagDays: number;
    contribution: number;
  }>;
}

export interface SimulationArtifact {
  type: 'simulation';
  /** The full simulation result from whatif-simulator */
  simulation: SimulationResult;
  /** Tabular timeline for frontend rendering */
  timeline: Array<{
    domain: string;
    dayFromNow: number;
    predictedChangePercent: number;
    lower: number;
    upper: number;
  }>;
  /** Intervention opportunities */
  interventions: Array<{
    domain: string;
    windowDays: number;
    effectiveness: number;
    suggestedAction: string;
  }>;
}

export interface ExplanationArtifact {
  type: 'explanation';
  /** The explanation chain from explanation-generator */
  explanationChain: ExplanationChain | null;
  /** Connection analysis for the primary relationship */
  connectionAnalysis: ConnectionAnalysis | null;
}

export interface DiagnosisArtifact {
  type: 'diagnosis';
  /** Anomaly explanation from explanation-generator */
  anomalyExplanation: AnomalyExplanation | null;
  /** Connection analyses showing causal paths to the diagnosed domain */
  upstreamAnalyses: ConnectionAnalysis[];
  /** Matched rule firings from brain-knowledge-context */
  triggeredRules: Array<{ title: string; naturalLanguage: string; matchedConditions: string[] }>;
}

// ── Lightweight Knowledge Context ──────────────────────────────────────
// The engine accepts a simplified version of BrainKnowledgeContext to avoid
// tight coupling. The copilot route constructs this from its DB queries.

export interface ActionKnowledgeContext {
  question: string;
  intent: UserIntent;
  extractedDomains: string[];
  primaryDomain: string;
  directCauses: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>>;
  directEffects: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>>;
  matchedRules: Array<{ title: string; naturalLanguage: string; conditions: string[]; triggered: boolean }>;
}

// ── Config ──────────────────────────────────────────────────────────────

export interface DomainActionEngineConfig {
  supabase: SupabaseClient;
  organizationId: string;
  /** Forecast horizon in days (default: 90) */
  defaultForecastHorizonDays?: number;
  /** Max cascade depth for simulations (default: 5) */
  maxCascadeDepth?: number;
  /** Include core brain DAG in queries (default: true) */
  includeCoreDAG?: boolean;
  verbose?: boolean;
}

// ============================================================================
// FACTORY
// ============================================================================

const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

export function createDomainActionEngine(config: DomainActionEngineConfig) {
  const {
    supabase,
    organizationId,
    defaultForecastHorizonDays = 90,
    maxCascadeDepth = 5,
    includeCoreDAG = true,
    verbose = false,
  } = config;

  const log = verbose
    ? (...args: unknown[]) => console.log('[ActionEngine]', ...args)
    : () => {};

  // ── Instantiate cognitive modules (lightweight — no DB calls at construction) ──

  const reasoner = createContextAwareReasoner({
    maxHops: 5,
    forecastHorizonDays: defaultForecastHorizonDays,
  });

  const forecaster = createTemporalForecaster({
    defaultHorizonDays: defaultForecastHorizonDays,
  });

  const simulator = createWhatIfSimulator({
    supabase,
    organizationId,
    maxCascadeDepth,
    verbose,
  });

  const explainer = createExplanationGenerator();

  // ── Execution Context Loader (lazy, cached per request) ──────────────
  // Pattern: consolidation-engine.ts lines 1160-1243

  let cachedDAG: CausalDAG | null = null;
  let cachedTimeSeries: Map<string, DailyTimeSeries> | null = null;
  let lastLoadedAt = 0;
  const CACHE_TTL_MS = 60_000; // 1 minute

  async function loadExecutionContext(): Promise<{
    dag: CausalDAG;
    timeSeries: Map<string, DailyTimeSeries>;
  }> {
    const now = Date.now();
    if (cachedDAG && cachedTimeSeries && (now - lastLoadedAt) < CACHE_TTL_MS) {
      log('Using cached execution context');
      return { dag: cachedDAG, timeSeries: cachedTimeSeries };
    }

    log('Loading execution context from DB...');

    // 1. Load DAG (same as consolidation-engine)
    const dag = await loadDAGFromDatabase(supabase, organizationId, { includeCoreDAG });

    // 2. Load signals and convert to time series (same as consolidation-engine)
    const orgIds = [organizationId];
    if (includeCoreDAG) orgIds.push(CORE_BRAIN_ORG_ID);
    const orgFilter = orgIds.map(id => `organization_id.eq.${id}`).join(',');

    const { data: signals } = await supabase
      .from('cross_domain_signals')
      .select('organization_id, source_domain, signal_type, signal_value, signal_timestamp')
      .or(orgFilter)
      .order('signal_timestamp', { ascending: false })
      .limit(10000);

    const timeSeries = signalsToTimeSeries((signals || []).map(s => ({
      organization_id: s.organization_id,
      source_domain: s.source_domain,
      signal_type: s.signal_type,
      signal_value: s.signal_value,
      signal_timestamp: s.signal_timestamp,
    })));

    cachedDAG = dag;
    cachedTimeSeries = timeSeries;
    lastLoadedAt = now;

    log(`Loaded: DAG ${dag.nodes.size} nodes, ${countEdges(dag)} edges. TimeSeries: ${timeSeries.size} domains.`);
    return { dag, timeSeries };
  }

  // ── Intent → Action Router ──────────────────────────────────────────

  function routeToAction(intent: UserIntent, question: string): ActionType {
    const lower = question.toLowerCase();

    // Pass 1: Explicit regex patterns override intent
    if (/what\s+(if|would\s+happen|happens)/.test(lower) || /\bsimulat/.test(lower)) {
      return 'simulate';
    }
    if (/\bforecast\b|\bpredict\b|\bproject(ion)?\b|\bestimate\s+\d+/.test(lower)) {
      return 'forecast';
    }
    if (/why\s+(is|did|are|has|does)|root\s+cause|\bdiagnos|\bwhat('s|\s+is)\s+(wrong|causing|driving)/.test(lower)) {
      return 'diagnose';
    }

    // Pass 2: Intent-based fallback
    switch (intent) {
      case 'build':    return 'forecast';
      case 'predict':  return 'forecast';
      case 'diagnose': return 'diagnose';
      case 'explain':  return 'explain';
      case 'general':  return 'explain';
    }
  }

  // ── WhatIf Scenario Parser ──────────────────────────────────────────

  function parseWhatIfScenario(question: string, domains: string[]): WhatIfScenario {
    const lower = question.toLowerCase();
    const sourceDomain = domains[0] || 'revenue';

    const direction: 'increase' | 'decrease' =
      /increase|grow|up|rise|double|triple|more|boost|higher/.test(lower) ? 'increase' : 'decrease';

    // Extract percentage
    const percentMatch = lower.match(/(\d+)\s*%/);
    const magnitudePercent = percentMatch ? parseInt(percentMatch[1], 10) : 20;

    // Extract time horizon
    const yearMatch = lower.match(/(\d+)\s*year/);
    const monthMatch = lower.match(/(\d+)\s*month/);
    const dayMatch = lower.match(/(\d+)\s*day/);
    const timeHorizonDays = yearMatch ? parseInt(yearMatch[1], 10) * 365
      : monthMatch ? parseInt(monthMatch[1], 10) * 30
      : dayMatch ? parseInt(dayMatch[1], 10)
      : 90;

    return { sourceDomain, direction, magnitudePercent, timeHorizonDays };
  }

  // ── Execute Forecast ────────────────────────────────────────────────

  async function executeForecast(
    domain: string,
    knowledge: ActionKnowledgeContext,
    horizonDays?: number,
  ): Promise<ActionArtifact> {
    const start = Date.now();
    const { dag, timeSeries } = await loadExecutionContext();
    const horizon = horizonDays || defaultForecastHorizonDays;

    // 1. Run temporal forecaster
    const forecast = forecaster.forecast(timeSeries, dag, domain, horizon);

    // 2. Analyze key driver connections (top 5 causes)
    const causes = knowledge.directCauses[domain] || [];
    const driverDomains = causes.slice(0, 5).map(c => c.source);
    const driverAnalyses: ConnectionAnalysis[] = [];

    for (const driver of driverDomains) {
      try {
        const analysis = reasoner.analyzeConnection(dag, driver, domain, undefined, timeSeries);
        if (analysis.prediction && analysis.prediction.bestPath) {
          driverAnalyses.push(analysis);
        }
      } catch (err) {
        log(`Driver analysis failed for ${driver} → ${domain}:`, err);
      }
    }

    // 3. Build table artifact
    const table = forecast.predictions.map(p => ({
      date: p.date,
      predicted: p.value,
      lower95: p.lower95,
      upper95: p.upper95,
    }));

    // 4. Build narrative
    const narrative = buildForecastNarrative(domain, forecast, driverAnalyses, horizon);

    return {
      actionType: 'forecast',
      domain,
      data: {
        type: 'forecast',
        forecast,
        driverAnalyses,
        table,
        drivers: forecast.upstreamDrivers,
      },
      narrative,
      confidence: forecast.confidence,
      durationMs: Date.now() - start,
      metadata: {
        modulesUsed: ['temporal-forecaster', 'context-aware-reasoner'],
        dagNodeCount: dag.nodes.size,
        dagEdgeCount: countEdges(dag),
        timeSeriesDomainsLoaded: timeSeries.size,
        executedAt: new Date().toISOString(),
      },
    };
  }

  // ── Execute Simulation ──────────────────────────────────────────────

  async function executeSimulation(
    scenario: WhatIfScenario,
  ): Promise<ActionArtifact> {
    const start = Date.now();

    // Simulator loads its own graph from DB internally
    const simulation = await simulator.simulate(scenario);

    // Load DAG just for metadata
    const { dag } = await loadExecutionContext();

    // Build timeline table
    const timeline = simulation.timeline.map((step: CascadeStep) => ({
      domain: step.toDomain,
      dayFromNow: step.cumulativeDays,
      predictedChangePercent: step.predictedChangePercent,
      lower: step.confidenceBand.lower,
      upper: step.confidenceBand.upper,
    }));

    // Build interventions list
    const interventions = simulation.interventions.map((iv: SimulationIntervention) => ({
      domain: iv.domain,
      windowDays: iv.windowDays,
      effectiveness: iv.effectiveness,
      suggestedAction: iv.suggestedAction,
    }));

    return {
      actionType: 'simulate',
      domain: scenario.sourceDomain,
      data: { type: 'simulation', simulation, timeline, interventions },
      narrative: simulation.narrative,
      confidence: simulation.overallConfidence,
      durationMs: Date.now() - start,
      metadata: {
        modulesUsed: ['whatif-simulator'],
        dagNodeCount: dag.nodes.size,
        dagEdgeCount: countEdges(dag),
        timeSeriesDomainsLoaded: 0,
        executedAt: new Date().toISOString(),
      },
    };
  }

  // ── Execute Explain ─────────────────────────────────────────────────

  async function executeExplain(
    domain: string,
    knowledge: ActionKnowledgeContext,
  ): Promise<ActionArtifact> {
    const start = Date.now();
    const { dag, timeSeries } = await loadExecutionContext();

    // Find the strongest connection TO this domain
    const causes = knowledge.directCauses[domain] || [];
    let connectionAnalysis: ConnectionAnalysis | null = null;
    let explanationChain: ExplanationChain | null = null;

    if (causes.length > 0) {
      try {
        connectionAnalysis = reasoner.analyzeConnection(
          dag, causes[0].source, domain, undefined, timeSeries,
        );

        // Generate explanation chain from the prediction
        if (connectionAnalysis.prediction && connectionAnalysis.prediction.bestPath) {
          explanationChain = explainer.explainPrediction(
            connectionAnalysis.prediction, dag,
          );
        }
      } catch (err) {
        log(`Explanation analysis failed for ${domain}:`, err);
      }
    }

    // Also try effects (what does this domain drive?)
    if (!connectionAnalysis) {
      const effects = knowledge.directEffects[domain] || [];
      if (effects.length > 0) {
        try {
          connectionAnalysis = reasoner.analyzeConnection(
            dag, domain, effects[0].target, undefined, timeSeries,
          );
          if (connectionAnalysis.prediction && connectionAnalysis.prediction.bestPath) {
            explanationChain = explainer.explainPrediction(
              connectionAnalysis.prediction, dag,
            );
          }
        } catch (err) {
          log(`Effect explanation failed for ${domain}:`, err);
        }
      }
    }

    const narrative = connectionAnalysis?.executiveSummary ||
      explanationChain?.narrative ||
      `Analysis of ${domain}: ${causes.length} upstream drivers found in the causal graph.`;

    return {
      actionType: 'explain',
      domain,
      data: {
        type: 'explanation',
        explanationChain,
        connectionAnalysis,
      },
      narrative,
      confidence: connectionAnalysis?.confidence || explanationChain?.confidence || 0.5,
      durationMs: Date.now() - start,
      metadata: {
        modulesUsed: ['context-aware-reasoner', 'explanation-generator'],
        dagNodeCount: dag.nodes.size,
        dagEdgeCount: countEdges(dag),
        timeSeriesDomainsLoaded: timeSeries.size,
        executedAt: new Date().toISOString(),
      },
    };
  }

  // ── Execute Diagnose ────────────────────────────────────────────────

  async function executeDiagnose(
    domain: string,
    knowledge: ActionKnowledgeContext,
  ): Promise<ActionArtifact> {
    const start = Date.now();
    const { dag, timeSeries } = await loadExecutionContext();

    // 1. Anomaly explanation (trace upstream root causes)
    let anomalyExplanation: AnomalyExplanation | null = null;
    try {
      anomalyExplanation = reasoner.explainAnomaly(
        { domain, metric: domain, deviation: 1.0, detectedAt: new Date() },
        dag,
      );
    } catch (err) {
      log(`Anomaly explanation failed for ${domain}:`, err);
    }

    // 2. Upstream connection analyses (top 5 causes)
    const causes = knowledge.directCauses[domain] || [];
    const upstreamAnalyses: ConnectionAnalysis[] = [];
    for (const cause of causes.slice(0, 5)) {
      try {
        const analysis = reasoner.analyzeConnection(dag, cause.source, domain, undefined, timeSeries);
        upstreamAnalyses.push(analysis);
      } catch (err) {
        log(`Upstream analysis failed for ${cause.source} → ${domain}:`, err);
      }
    }

    // 3. Include triggered rules
    const triggeredRules = knowledge.matchedRules
      .filter(r => r.triggered)
      .map(r => ({
        title: r.title,
        naturalLanguage: r.naturalLanguage,
        matchedConditions: r.conditions,
      }));

    const narrative = anomalyExplanation?.narrative ||
      `Diagnosis of ${domain}: ${upstreamAnalyses.length} upstream drivers analyzed, ${triggeredRules.length} rules triggered.`;

    return {
      actionType: 'diagnose',
      domain,
      data: { type: 'diagnosis', anomalyExplanation, upstreamAnalyses, triggeredRules },
      narrative,
      confidence: anomalyExplanation?.mostLikelyCause?.confidence || 0.5,
      durationMs: Date.now() - start,
      metadata: {
        modulesUsed: ['context-aware-reasoner', 'explanation-generator'],
        dagNodeCount: dag.nodes.size,
        dagEdgeCount: countEdges(dag),
        timeSeriesDomainsLoaded: timeSeries.size,
        executedAt: new Date().toISOString(),
      },
    };
  }

  // ── Main Dispatch ───────────────────────────────────────────────────

  async function execute(
    question: string,
    knowledge: ActionKnowledgeContext,
    overrideHorizonDays?: number,
  ): Promise<ActionArtifact> {
    const actionType = routeToAction(knowledge.intent, question);
    const domain = knowledge.primaryDomain;

    log(`Routing: intent=${knowledge.intent} → action=${actionType}, domain=${domain}`);

    try {
      switch (actionType) {
        case 'forecast':
          return await executeForecast(domain, knowledge, overrideHorizonDays);
        case 'simulate': {
          const scenario = parseWhatIfScenario(question, knowledge.extractedDomains);
          return await executeSimulation(scenario);
        }
        case 'explain':
          return await executeExplain(domain, knowledge);
        case 'diagnose':
          return await executeDiagnose(domain, knowledge);
      }
    } catch (err) {
      // Graceful degradation: return a minimal artifact on failure
      log(`Action execution failed (${actionType}):`, err);
      return {
        actionType,
        domain,
        data: actionType === 'forecast'
          ? { type: 'forecast', forecast: { domain, horizonDays: 0, predictions: [], upstreamDrivers: [], confidence: 0, summary: 'Insufficient data for forecast' }, driverAnalyses: [], table: [], drivers: [] } as ForecastArtifact
          : actionType === 'simulate'
          ? { type: 'simulation', simulation: { scenario: { sourceDomain: domain, direction: 'increase', magnitudePercent: 0 }, cascadePaths: [], timeline: [], affectedDomains: [], totalImpactPercent: 0, overallConfidence: 0, interventions: [], narrative: 'Simulation could not be completed', durationMs: 0 }, timeline: [], interventions: [] } as SimulationArtifact
          : actionType === 'explain'
          ? { type: 'explanation', explanationChain: null, connectionAnalysis: null } as ExplanationArtifact
          : { type: 'diagnosis', anomalyExplanation: null, upstreamAnalyses: [], triggeredRules: [] } as DiagnosisArtifact,
        narrative: `Unable to complete ${actionType} for ${domain}. The brain needs more signal data to produce executable results.`,
        confidence: 0,
        durationMs: Date.now(),
        metadata: {
          modulesUsed: [],
          dagNodeCount: 0,
          dagEdgeCount: 0,
          timeSeriesDomainsLoaded: 0,
          executedAt: new Date().toISOString(),
        },
      };
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  function countEdges(dag: CausalDAG): number {
    let count = 0;
    dag.edges.forEach(targets => { count += targets.size; });
    return count;
  }

  function buildForecastNarrative(
    domain: string,
    forecast: ForecastResult,
    driverAnalyses: ConnectionAnalysis[],
    horizonDays: number,
  ): string {
    const parts: string[] = [];

    parts.push(`${horizonDays}-day ${domain} forecast (confidence: ${(forecast.confidence * 100).toFixed(0)}%).`);
    parts.push(forecast.summary);

    if (forecast.upstreamDrivers.length > 0) {
      const topDriver = forecast.upstreamDrivers[0];
      parts.push(`Key driver: ${topDriver.domain} (weight: ${topDriver.weight.toFixed(2)}, lag: ${topDriver.lagDays}d, contribution: ${(topDriver.contribution * 100).toFixed(0)}%).`);
    }

    if (forecast.predictions.length > 0) {
      const first = forecast.predictions[0];
      const last = forecast.predictions[forecast.predictions.length - 1];
      const trendDir = last.value > first.value ? 'upward' : last.value < first.value ? 'downward' : 'flat';
      parts.push(`Trend: ${trendDir} from ${first.value.toFixed(3)} to ${last.value.toFixed(3)} over ${forecast.predictions.length} periods.`);
    }

    if (driverAnalyses.length > 0) {
      parts.push(`${driverAnalyses.length} upstream causal paths analyzed with step-by-step reasoning.`);
    }

    return parts.join(' ');
  }

  // ── Cache Management ────────────────────────────────────────────────

  function invalidateCache(): void {
    cachedDAG = null;
    cachedTimeSeries = null;
    lastLoadedAt = 0;
    log('Execution context cache invalidated.');
  }

  // ── Public API ──────────────────────────────────────────────────────

  return {
    /** Main dispatcher: routes question to the right execution module */
    execute,
    /** Direct access to individual action handlers */
    executeForecast,
    executeSimulation,
    executeExplain,
    executeDiagnose,
    /** Route a question to an action type without executing */
    routeToAction,
    /** Parse a what-if scenario from natural language */
    parseWhatIfScenario,
    /** Clear DAG + time series cache (called after consolidation) */
    invalidateCache,
  };
}

// ============================================================================
// PROMPT FORMATTING HELPERS (used by copilot route)
// ============================================================================

/**
 * Formats an ActionArtifact into a text representation for LLM system prompt.
 * The LLM uses these REAL computed numbers instead of inventing generic advice.
 */
export function formatArtifactForPrompt(artifact: ActionArtifact): string {
  const parts: string[] = [];

  parts.push(`Action: ${artifact.actionType} | Domain: ${artifact.domain} | Confidence: ${(artifact.confidence * 100).toFixed(0)}%`);
  parts.push(`Modules: ${artifact.metadata.modulesUsed.join(', ')} | DAG: ${artifact.metadata.dagNodeCount} nodes, ${artifact.metadata.dagEdgeCount} edges`);
  parts.push('');

  if (artifact.data.type === 'forecast') {
    const fd = artifact.data as ForecastArtifact;
    parts.push(`## Forecast Results (${fd.forecast.horizonDays} days)`);
    parts.push(fd.forecast.summary);
    parts.push('');

    if (fd.table.length > 0) {
      parts.push('| Date | Predicted | Lower95 | Upper95 |');
      parts.push('|------|-----------|---------|---------|');
      // Show first 10 + last 5 if table is large
      const toShow = fd.table.length <= 15
        ? fd.table
        : [...fd.table.slice(0, 10), ...fd.table.slice(-5)];
      for (const row of toShow) {
        parts.push(`| ${row.date} | ${row.predicted.toFixed(4)} | ${row.lower95.toFixed(4)} | ${row.upper95.toFixed(4)} |`);
      }
      if (fd.table.length > 15) {
        parts.push(`... (${fd.table.length - 15} rows omitted)`);
      }
    }

    if (fd.drivers.length > 0) {
      parts.push('');
      parts.push('Key Drivers:');
      for (const d of fd.drivers.slice(0, 5)) {
        parts.push(`  - ${d.domain}: weight=${d.weight.toFixed(3)}, lag=${d.lagDays}d, contribution=${(d.contribution * 100).toFixed(0)}%`);
      }
    }

    if (fd.driverAnalyses.length > 0) {
      parts.push('');
      parts.push('Driver Analysis:');
      for (const da of fd.driverAnalyses.slice(0, 3)) {
        parts.push(`  - ${da.source} → ${da.target}: ${da.executiveSummary}`);
      }
    }
  }

  if (artifact.data.type === 'simulation') {
    const sd = artifact.data as SimulationArtifact;
    parts.push(`## Simulation Results`);
    parts.push(`Scenario: ${sd.simulation.scenario.direction} ${sd.simulation.scenario.magnitudePercent}% in ${sd.simulation.scenario.sourceDomain}`);
    parts.push(`Total Impact: ${sd.simulation.totalImpactPercent.toFixed(1)}% | Affected Domains: ${sd.simulation.affectedDomains.join(', ')}`);
    parts.push('');

    if (sd.timeline.length > 0) {
      parts.push('Cascade Timeline:');
      parts.push('| Domain | Day | Change% | Lower | Upper |');
      parts.push('|--------|-----|---------|-------|-------|');
      for (const row of sd.timeline.slice(0, 15)) {
        parts.push(`| ${row.domain} | ${row.dayFromNow} | ${row.predictedChangePercent.toFixed(1)}% | ${row.lower.toFixed(1)}% | ${row.upper.toFixed(1)}% |`);
      }
    }

    if (sd.interventions.length > 0) {
      parts.push('');
      parts.push('Intervention Opportunities:');
      for (const iv of sd.interventions) {
        parts.push(`  - ${iv.domain}: ${iv.suggestedAction} (window: ${iv.windowDays}d, effectiveness: ${(iv.effectiveness * 100).toFixed(0)}%)`);
      }
    }
  }

  if (artifact.data.type === 'explanation') {
    const ed = artifact.data as ExplanationArtifact;
    if (ed.connectionAnalysis) {
      parts.push(`## Connection Analysis: ${ed.connectionAnalysis.source} → ${ed.connectionAnalysis.target}`);
      parts.push(ed.connectionAnalysis.executiveSummary);
    }

    if (ed.explanationChain) {
      parts.push('');
      parts.push('Reasoning Chain:');
      for (const step of ed.explanationChain.steps) {
        parts.push(`  ${step.stepNum}. ${step.inference} (confidence: ${(step.confidence * 100).toFixed(0)}%, evidence: ${step.evidenceType})`);
      }

      if (ed.explanationChain.suggestedActions.length > 0) {
        parts.push('');
        parts.push('Suggested Actions:');
        for (const action of ed.explanationChain.suggestedActions) {
          parts.push(`  - ${action}`);
        }
      }
    }
  }

  if (artifact.data.type === 'diagnosis') {
    const dd = artifact.data as DiagnosisArtifact;
    parts.push(`## Diagnosis of ${artifact.domain}`);

    if (dd.anomalyExplanation?.mostLikelyCause) {
      const cause = dd.anomalyExplanation.mostLikelyCause;
      parts.push(`Most Likely Root Cause: ${cause.domain} (confidence: ${(cause.confidence * 100).toFixed(0)}%, lag: ${cause.lagDays}d)`);
      parts.push(`Explanation: ${cause.explanation}`);
    }

    if (dd.anomalyExplanation?.alternativeCauses && dd.anomalyExplanation.alternativeCauses.length > 0) {
      parts.push('');
      parts.push('Alternative Causes:');
      for (const alt of dd.anomalyExplanation.alternativeCauses.slice(0, 3)) {
        parts.push(`  - ${alt.domain}: ${alt.explanation} (confidence: ${(alt.confidence * 100).toFixed(0)}%)`);
      }
    }

    if (dd.anomalyExplanation?.prescriptiveActions && dd.anomalyExplanation.prescriptiveActions.length > 0) {
      parts.push('');
      parts.push('Prescriptive Actions:');
      for (const action of dd.anomalyExplanation.prescriptiveActions) {
        parts.push(`  - ${action.action} (expected impact: ${action.expectedImpact})`);
      }
    }

    if (dd.triggeredRules.length > 0) {
      parts.push('');
      parts.push('Triggered Rules:');
      for (const rule of dd.triggeredRules.slice(0, 5)) {
        parts.push(`  - ${rule.title}: ${rule.naturalLanguage}`);
      }
    }

    if (dd.upstreamAnalyses.length > 0) {
      parts.push('');
      parts.push('Upstream Analysis:');
      for (const ua of dd.upstreamAnalyses.slice(0, 3)) {
        parts.push(`  - ${ua.source} → ${ua.target}: ${ua.executiveSummary}`);
      }
    }
  }

  return parts.join('\n');
}
