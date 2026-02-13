/**
 * Domain Action Engine V2 — Motor Cortex (CTO-Grade)
 * ====================================================
 *
 * Brain Analog: The Motor Cortex translates frontal lobe intentions into
 * coordinated muscle movements that produce observable output. Without it,
 * the brain can THINK but cannot ACT.
 *
 * V2 CTO Enhancements (6 gaps closed):
 *   1. LLM Narrative Layer — Claude interprets and narrates every artifact
 *      via the Brain Amplifier (Sonnet for narratives, Haiku for summaries)
 *   2. Smart Horizon Detection — parses "12-month", "quarterly", "next year"
 *      from natural language questions
 *   3. Multi-Domain Forecasting — forecasts ALL causally-connected domains,
 *      not just the primary one
 *   4. Confidence-Gated Actions — skips low-confidence results, explains why
 *      the brain needs more data
 *   5. Composite Actions — "build model" triggers forecast + simulate + explain
 *      together in one orchestrated execution
 *   6. Rich Explain/Diagnose — analyzes ALL upstream+downstream connections,
 *      not just the strongest one
 *
 * Architecture:
 *   User Intent → Smart Router → [Horizon Parser] → [Composite Detector]
 *     → Execution Module(s) → [Confidence Gate] → [LLM Narrator] → Artifact
 *
 * 5 Action Types (V2):
 *   "forecast"   → temporal-forecaster + multi-domain + drivers  → ForecastArtifact
 *   "simulate"   → whatif-simulator + scenario parser            → SimulationArtifact
 *   "explain"    → context-aware-reasoner + ALL connections      → ExplanationArtifact
 *   "diagnose"   → anomaly tracing + rules + upstream analysis   → DiagnosisArtifact
 *   "composite"  → forecast + simulate + explain together        → CompositeArtifact
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CausalDAG } from '../causality/continuous-learner';
import type { DailyTimeSeries } from '../causality/signal-to-timeseries';
import type { ForecastResult } from '../causality/temporal-forecaster';
import type { SimulationResult, WhatIfScenario, CascadeStep, SimulationIntervention } from './whatif-simulator';
import type { ConnectionAnalysis } from '../causality/context-aware-reasoner';
import type { ExplanationChain, AnomalyExplanation } from '../causality/explanation-generator';
import type { BrainAmplifierConfig } from './llm-brain-amplifier';
import { loadDAGFromDatabase } from '../causality/continuous-learner';
import { signalsToTimeSeries } from '../causality/signal-to-timeseries';
import { createContextAwareReasoner } from '../causality/context-aware-reasoner';
import { createTemporalForecaster } from '../causality/temporal-forecaster';
import { createWhatIfSimulator } from './whatif-simulator';
import { createExplanationGenerator } from '../causality/explanation-generator';
import { createBrainAmplifier } from './llm-brain-amplifier';

// ============================================================================
// TYPES
// ============================================================================

/** The 5 action classes the engine can execute (V2: added 'composite') */
export type ActionType = 'forecast' | 'simulate' | 'explain' | 'diagnose' | 'composite';

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
  data: ForecastArtifact | SimulationArtifact | ExplanationArtifact | DiagnosisArtifact | CompositeArtifact;
  /** Natural language narrative explaining the artifact (V2: LLM-generated when available) */
  narrative: string;
  /** Confidence in the overall result (0-1) */
  confidence: number;
  /** Whether confidence was below threshold — signals data insufficiency */
  confidenceGated: boolean;
  /** Execution timing in ms */
  durationMs: number;
  /** V2: Detected horizon from question (or default) */
  horizonDays: number;
  /** Metadata for audit trail */
  metadata: {
    modulesUsed: string[];
    dagNodeCount: number;
    dagEdgeCount: number;
    timeSeriesDomainsLoaded: number;
    executedAt: string;
    /** V2: Whether LLM was used for narrative */
    llmNarrativeUsed: boolean;
    /** V2: Domains that were forecast (multi-domain) */
    forecastedDomains?: string[];
    /** V2: Horizon source */
    horizonSource: 'parsed' | 'default' | 'override';
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
  /** V2: Multi-domain forecasts for causally-connected domains */
  relatedForecasts: Array<{
    domain: string;
    forecast: ForecastResult;
    table: Array<{ date: string; predicted: number; lower95: number; upper95: number }>;
    confidence: number;
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
  /** V2: ALL upstream connection analyses */
  allUpstreamAnalyses: ConnectionAnalysis[];
  /** V2: ALL downstream connection analyses */
  allDownstreamAnalyses: ConnectionAnalysis[];
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

/** V2: Composite artifact that combines forecast + simulate + explain */
export interface CompositeArtifact {
  type: 'composite';
  /** The primary forecast */
  forecast: ForecastArtifact | null;
  /** A scenario simulation (default: 20% increase in primary domain) */
  simulation: SimulationArtifact | null;
  /** Causal explanation of the primary domain */
  explanation: ExplanationArtifact | null;
  /** Individual confidences */
  confidences: {
    forecast: number;
    simulation: number;
    explanation: number;
  };
}

// ── Lightweight Knowledge Context ──────────────────────────────────────

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
  /** V2: Minimum confidence to return full artifact (default: 0.15) */
  confidenceThreshold?: number;
  /** V2: Max related domains to forecast (default: 3) */
  maxRelatedForecasts?: number;
  /** V2: LLM amplifier config (optional — enables Claude narrative layer) */
  amplifierConfig?: BrainAmplifierConfig;
  verbose?: boolean;
}

// ============================================================================
// SMART HORIZON DETECTION (V2)
// ============================================================================

/** Parse temporal cues from natural language into days */
export function parseHorizonFromQuestion(question: string): { days: number; source: 'parsed' | 'default' } {
  const lower = question.toLowerCase();

  // Exact period names
  if (/\bnext\s+quarter\b|\bquarterly\b|\b3[\s-]month\b|\bq[1-4]\b/.test(lower)) {
    return { days: 90, source: 'parsed' };
  }
  if (/\bnext\s+year\b|\bannual\b|\byearly\b|\bfy\s*\d{2,4}\b/.test(lower)) {
    return { days: 365, source: 'parsed' };
  }
  if (/\bnext\s+half\b|\bh[12]\b|\b6[\s-]month\b|\bsemi[\s-]?annual\b/.test(lower)) {
    return { days: 180, source: 'parsed' };
  }
  if (/\bnext\s+week\b|\bweekly\b|\b7[\s-]day\b/.test(lower)) {
    return { days: 7, source: 'parsed' };
  }
  if (/\bnext\s+month\b|\bmonthly\b|\b30[\s-]day\b/.test(lower)) {
    return { days: 30, source: 'parsed' };
  }

  // N-year, N-month, N-week, N-day patterns
  const yearMatch = lower.match(/(\d+)[\s-]?year/);
  if (yearMatch) return { days: parseInt(yearMatch[1], 10) * 365, source: 'parsed' };

  const monthMatch = lower.match(/(\d+)[\s-]?month/);
  if (monthMatch) return { days: parseInt(monthMatch[1], 10) * 30, source: 'parsed' };

  const weekMatch = lower.match(/(\d+)[\s-]?week/);
  if (weekMatch) return { days: parseInt(weekMatch[1], 10) * 7, source: 'parsed' };

  const dayMatch = lower.match(/(\d+)[\s-]?day/);
  if (dayMatch) return { days: parseInt(dayMatch[1], 10), source: 'parsed' };

  // "long-term" / "short-term" heuristics
  if (/\blong[\s-]?term\b|\bstrategic\b|\bmulti[\s-]?year\b/.test(lower)) {
    return { days: 365, source: 'parsed' };
  }
  if (/\bshort[\s-]?term\b|\bnear[\s-]?term\b|\bimmediate\b/.test(lower)) {
    return { days: 30, source: 'parsed' };
  }

  return { days: 0, source: 'default' }; // 0 = use default
}

// ============================================================================
// COMPOSITE DETECTION (V2)
// ============================================================================

/** Detect if the question requires a composite action (forecast+simulate+explain) */
function isCompositeRequest(question: string, intent: UserIntent): boolean {
  const lower = question.toLowerCase();

  // Explicit composite triggers
  if (/\bbuild\s+(me\s+)?(a\s+)?((full|complete|comprehensive)\s+)?(financial\s+)?model\b/.test(lower)) return true;
  if (/\bfull\s+analysis\b|\bcomplete\s+analysis\b|\bcomprehensive\b/.test(lower)) return true;
  if (/\bbuild\s+.*\bforecast\s+.*\b(and|with)\s+.*\b(scenario|simulation)\b/.test(lower)) return true;
  if (/\bforecast\s+and\s+(simulate|explain)\b/.test(lower)) return true;
  if (/\b(end[\s-]to[\s-]end|360|full[\s-]?picture)\b/.test(lower)) return true;

  // "build me a model" without specific action → composite
  if (intent === 'build' && /\bmodel\b/.test(lower) && !/\bforecast\s+model\b/.test(lower)) return true;

  return false;
}

// ============================================================================
// FACTORY
// ============================================================================

const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

/** Minimum confidence below which we gate the artifact with a data-insufficiency warning */
const DEFAULT_CONFIDENCE_THRESHOLD = 0.15;

/** Maximum number of related domains to forecast alongside primary */
const DEFAULT_MAX_RELATED_FORECASTS = 3;

export function createDomainActionEngine(config: DomainActionEngineConfig) {
  const {
    supabase,
    organizationId,
    defaultForecastHorizonDays = 90,
    maxCascadeDepth = 5,
    includeCoreDAG = true,
    confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD,
    maxRelatedForecasts = DEFAULT_MAX_RELATED_FORECASTS,
    amplifierConfig,
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

  // ── V2: LLM Brain Amplifier (optional — for Claude narrative layer) ──

  const amplifier = amplifierConfig
    ? createBrainAmplifier(amplifierConfig)
    : null;

  // ── Execution Context Loader (lazy, cached per request) ──────────────

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

    // 1. Load DAG
    const dag = await loadDAGFromDatabase(supabase, organizationId, { includeCoreDAG });

    // 2. Load signals and convert to time series
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
    // V2: Check for composite requests first
    if (isCompositeRequest(question, intent)) {
      return 'composite';
    }

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

    // Use smart horizon detection
    const { days } = parseHorizonFromQuestion(question);
    const timeHorizonDays = days > 0 ? days : 90;

    return { sourceDomain, direction, magnitudePercent, timeHorizonDays };
  }

  // ── V2: Multi-Domain Forecasting ──────────────────────────────────────

  function getRelatedDomainsForForecasting(
    domain: string,
    knowledge: ActionKnowledgeContext,
  ): string[] {
    const related = new Set<string>();

    // Add direct causes (upstream drivers)
    const causes = knowledge.directCauses[domain] || [];
    for (const c of causes.slice(0, maxRelatedForecasts)) {
      related.add(c.source);
    }

    // Add direct effects (downstream impacts)
    const effects = knowledge.directEffects[domain] || [];
    for (const e of effects.slice(0, Math.max(1, maxRelatedForecasts - related.size))) {
      related.add(e.target);
    }

    // Remove primary domain
    related.delete(domain);

    return Array.from(related).slice(0, maxRelatedForecasts);
  }

  // ── V2: LLM Narrative Generation ──────────────────────────────────────

  async function generateLLMNarrative(
    artifact: ActionArtifact,
    question: string,
  ): Promise<string> {
    if (!amplifier) return artifact.narrative; // No amplifier = use template narrative

    try {
      if (artifact.actionType === 'simulate' && artifact.data.type === 'simulation') {
        const sd = artifact.data as SimulationArtifact;
        const result = await amplifier.generateScenarioNarrative({
          sourceDomain: sd.simulation.scenario.sourceDomain,
          direction: sd.simulation.scenario.direction,
          magnitudePercent: sd.simulation.scenario.magnitudePercent,
          affectedDomains: sd.simulation.affectedDomains,
          totalImpactPercent: sd.simulation.totalImpactPercent,
          overallConfidence: sd.simulation.overallConfidence,
          templateNarrative: sd.simulation.narrative,
          interventions: sd.interventions.map(iv => ({
            domain: iv.domain,
            suggestedAction: iv.suggestedAction,
            effectiveness: iv.effectiveness,
          })),
          cascadeSteps: sd.simulation.timeline.map((step: CascadeStep) => ({
            fromDomain: step.fromDomain,
            toDomain: step.toDomain,
            predictedChangePercent: step.predictedChangePercent,
            cumulativeDays: step.cumulativeDays,
          })),
        });
        return result.narrative || artifact.narrative;
      }

      if (artifact.actionType === 'forecast' && artifact.data.type === 'forecast') {
        const fd = artifact.data as ForecastArtifact;
        // Use amplifyInsight for forecast narratives
        const result = await amplifier.amplifyInsight({
          type: 'forecast',
          title: `${artifact.domain} ${artifact.horizonDays}-day forecast`,
          explanation: artifact.narrative,
          domains: [artifact.domain, ...fd.drivers.map(d => d.domain)],
          importance: Math.round(artifact.confidence * 100),
          surpriseScore: fd.relatedForecasts.length > 0 ? 60 : 30,
          evidence: {
            causalEdges: fd.drivers.map(d => ({
              source: d.domain,
              target: artifact.domain,
              weight: d.weight,
            })),
            statistics: {
              predictions: fd.table.length,
              confidence: artifact.confidence,
              horizonDays: artifact.horizonDays,
              driverCount: fd.drivers.length,
              relatedDomains: fd.relatedForecasts.length,
            },
          },
        });
        return result.explanation || artifact.narrative;
      }

      if (artifact.actionType === 'diagnose' || artifact.actionType === 'explain') {
        const result = await amplifier.amplifyInsight({
          type: artifact.actionType,
          title: `${artifact.actionType} ${artifact.domain}`,
          explanation: artifact.narrative,
          domains: [artifact.domain],
          importance: Math.round(artifact.confidence * 100),
          surpriseScore: 40,
        });
        return result.explanation || artifact.narrative;
      }

      // Composite — generate executive briefing
      if (artifact.actionType === 'composite') {
        const result = await amplifier.generateConsolidationBriefing({
          narrative: artifact.narrative,
          discoveries: [`Composite analysis of ${artifact.domain} completed with ${artifact.confidence * 100}% confidence`],
          warnings: artifact.confidenceGated ? ['Low confidence — insufficient signal data for reliable analysis'] : [],
        });
        return result.executiveSummary || artifact.narrative;
      }
    } catch (err) {
      log('LLM narrative generation failed (graceful degradation):', err);
    }

    return artifact.narrative;
  }

  // ── V2: Confidence Gating ────────────────────────────────────────────

  function applyConfidenceGate(artifact: ActionArtifact): ActionArtifact {
    if (artifact.confidence >= confidenceThreshold) {
      return { ...artifact, confidenceGated: false };
    }

    // Gate the artifact — mark it and augment narrative
    const gateWarning = `⚠️ Low confidence (${(artifact.confidence * 100).toFixed(0)}%). ` +
      `The brain needs more signal data in the "${artifact.domain}" domain to produce reliable results. ` +
      `Consider adding more data sources or training the brain with domain-specific packs.`;

    return {
      ...artifact,
      confidenceGated: true,
      narrative: gateWarning + '\n\n' + artifact.narrative,
    };
  }

  // ── Execute Forecast ────────────────────────────────────────────────

  async function executeForecast(
    domain: string,
    knowledge: ActionKnowledgeContext,
    horizonDays: number,
    horizonSource: 'parsed' | 'default' | 'override',
  ): Promise<ActionArtifact> {
    const start = Date.now();
    const { dag, timeSeries } = await loadExecutionContext();

    // 1. Run primary domain forecast
    const forecast = forecaster.forecast(timeSeries, dag, domain, horizonDays);

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

    // 4. V2: Multi-domain forecasting
    const relatedDomains = getRelatedDomainsForForecasting(domain, knowledge);
    const relatedForecasts: ForecastArtifact['relatedForecasts'] = [];

    for (const relDomain of relatedDomains) {
      try {
        const relForecast = forecaster.forecast(timeSeries, dag, relDomain, horizonDays);
        if (relForecast.predictions.length > 0) {
          relatedForecasts.push({
            domain: relDomain,
            forecast: relForecast,
            table: relForecast.predictions.map(p => ({
              date: p.date,
              predicted: p.value,
              lower95: p.lower95,
              upper95: p.upper95,
            })),
            confidence: relForecast.confidence,
          });
        }
      } catch (err) {
        log(`Related forecast failed for ${relDomain}:`, err);
      }
    }

    // 5. Build narrative
    const narrative = buildForecastNarrative(domain, forecast, driverAnalyses, horizonDays, relatedForecasts);

    const forecastedDomains = [domain, ...relatedForecasts.map(rf => rf.domain)];

    return {
      actionType: 'forecast',
      domain,
      data: {
        type: 'forecast',
        forecast,
        driverAnalyses,
        table,
        drivers: forecast.upstreamDrivers,
        relatedForecasts,
      },
      narrative,
      confidence: forecast.confidence,
      confidenceGated: false,
      durationMs: Date.now() - start,
      horizonDays,
      metadata: {
        modulesUsed: ['temporal-forecaster', 'context-aware-reasoner'],
        dagNodeCount: dag.nodes.size,
        dagEdgeCount: countEdges(dag),
        timeSeriesDomainsLoaded: timeSeries.size,
        executedAt: new Date().toISOString(),
        llmNarrativeUsed: false,
        forecastedDomains,
        horizonSource,
      },
    };
  }

  // ── Execute Simulation ──────────────────────────────────────────────

  async function executeSimulation(
    scenario: WhatIfScenario,
    horizonDays: number,
    horizonSource: 'parsed' | 'default' | 'override',
  ): Promise<ActionArtifact> {
    const start = Date.now();

    const simulation = await simulator.simulate(scenario);
    const { dag } = await loadExecutionContext();

    const timeline = simulation.timeline.map((step: CascadeStep) => ({
      domain: step.toDomain,
      dayFromNow: step.cumulativeDays,
      predictedChangePercent: step.predictedChangePercent,
      lower: step.confidenceBand.lower,
      upper: step.confidenceBand.upper,
    }));

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
      confidenceGated: false,
      durationMs: Date.now() - start,
      horizonDays,
      metadata: {
        modulesUsed: ['whatif-simulator'],
        dagNodeCount: dag.nodes.size,
        dagEdgeCount: countEdges(dag),
        timeSeriesDomainsLoaded: 0,
        executedAt: new Date().toISOString(),
        llmNarrativeUsed: false,
        horizonSource,
      },
    };
  }

  // ── Execute Explain (V2: ALL connections, not just strongest) ───────

  async function executeExplain(
    domain: string,
    knowledge: ActionKnowledgeContext,
    horizonDays: number,
    horizonSource: 'parsed' | 'default' | 'override',
  ): Promise<ActionArtifact> {
    const start = Date.now();
    const { dag, timeSeries } = await loadExecutionContext();

    // V2: Analyze ALL upstream connections (not just strongest)
    const causes = knowledge.directCauses[domain] || [];
    const allUpstreamAnalyses: ConnectionAnalysis[] = [];
    let bestConnectionAnalysis: ConnectionAnalysis | null = null;
    let explanationChain: ExplanationChain | null = null;

    for (const cause of causes.slice(0, 8)) {
      try {
        const analysis = reasoner.analyzeConnection(
          dag, cause.source, domain, undefined, timeSeries,
        );
        allUpstreamAnalyses.push(analysis);

        // Track best for primary explanation
        if (!bestConnectionAnalysis ||
            (analysis.confidence > (bestConnectionAnalysis.confidence || 0))) {
          bestConnectionAnalysis = analysis;
        }
      } catch (err) {
        log(`Upstream analysis failed for ${cause.source} → ${domain}:`, err);
      }
    }

    // Generate explanation chain from best connection
    if (bestConnectionAnalysis?.prediction?.bestPath) {
      try {
        explanationChain = explainer.explainPrediction(
          bestConnectionAnalysis.prediction, dag,
        );
      } catch (err) {
        log(`Explanation chain generation failed:`, err);
      }
    }

    // V2: Also analyze ALL downstream effects
    const effects = knowledge.directEffects[domain] || [];
    const allDownstreamAnalyses: ConnectionAnalysis[] = [];

    for (const effect of effects.slice(0, 8)) {
      try {
        const analysis = reasoner.analyzeConnection(
          dag, domain, effect.target, undefined, timeSeries,
        );
        allDownstreamAnalyses.push(analysis);

        // If no upstream found, use downstream for primary
        if (!bestConnectionAnalysis) {
          bestConnectionAnalysis = analysis;
          if (analysis.prediction?.bestPath) {
            explanationChain = explainer.explainPrediction(analysis.prediction, dag);
          }
        }
      } catch (err) {
        log(`Downstream analysis failed for ${domain} → ${effect.target}:`, err);
      }
    }

    const narrative = buildExplanationNarrative(
      domain, bestConnectionAnalysis, explanationChain,
      allUpstreamAnalyses, allDownstreamAnalyses,
    );

    return {
      actionType: 'explain',
      domain,
      data: {
        type: 'explanation',
        explanationChain,
        connectionAnalysis: bestConnectionAnalysis,
        allUpstreamAnalyses,
        allDownstreamAnalyses,
      },
      narrative,
      confidence: bestConnectionAnalysis?.confidence || explanationChain?.confidence || 0.5,
      confidenceGated: false,
      durationMs: Date.now() - start,
      horizonDays,
      metadata: {
        modulesUsed: ['context-aware-reasoner', 'explanation-generator'],
        dagNodeCount: dag.nodes.size,
        dagEdgeCount: countEdges(dag),
        timeSeriesDomainsLoaded: timeSeries.size,
        executedAt: new Date().toISOString(),
        llmNarrativeUsed: false,
        horizonSource,
      },
    };
  }

  // ── Execute Diagnose ────────────────────────────────────────────────

  async function executeDiagnose(
    domain: string,
    knowledge: ActionKnowledgeContext,
    horizonDays: number,
    horizonSource: 'parsed' | 'default' | 'override',
  ): Promise<ActionArtifact> {
    const start = Date.now();
    const { dag, timeSeries } = await loadExecutionContext();

    // 1. Anomaly explanation
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

    // 3. Triggered rules
    const triggeredRules = knowledge.matchedRules
      .filter(r => r.triggered)
      .map(r => ({
        title: r.title,
        naturalLanguage: r.naturalLanguage,
        matchedConditions: r.conditions,
      }));

    const narrative = buildDiagnosisNarrative(domain, anomalyExplanation, upstreamAnalyses, triggeredRules);

    return {
      actionType: 'diagnose',
      domain,
      data: { type: 'diagnosis', anomalyExplanation, upstreamAnalyses, triggeredRules },
      narrative,
      confidence: anomalyExplanation?.mostLikelyCause?.confidence || 0.5,
      confidenceGated: false,
      durationMs: Date.now() - start,
      horizonDays,
      metadata: {
        modulesUsed: ['context-aware-reasoner', 'explanation-generator'],
        dagNodeCount: dag.nodes.size,
        dagEdgeCount: countEdges(dag),
        timeSeriesDomainsLoaded: timeSeries.size,
        executedAt: new Date().toISOString(),
        llmNarrativeUsed: false,
        horizonSource,
      },
    };
  }

  // ── V2: Execute Composite ─────────────────────────────────────────────

  async function executeComposite(
    domain: string,
    knowledge: ActionKnowledgeContext,
    horizonDays: number,
    horizonSource: 'parsed' | 'default' | 'override',
    question: string,
  ): Promise<ActionArtifact> {
    const start = Date.now();

    // Run forecast, simulation, and explanation in parallel
    const [forecastArtifact, simulationArtifact, explainArtifact] = await Promise.allSettled([
      executeForecast(domain, knowledge, horizonDays, horizonSource),
      executeSimulation(
        { sourceDomain: domain, direction: 'increase', magnitudePercent: 20, timeHorizonDays: horizonDays },
        horizonDays,
        horizonSource,
      ),
      executeExplain(domain, knowledge, horizonDays, horizonSource),
    ]);

    const forecastData = forecastArtifact.status === 'fulfilled'
      ? forecastArtifact.value.data as ForecastArtifact : null;
    const simData = simulationArtifact.status === 'fulfilled'
      ? simulationArtifact.value.data as SimulationArtifact : null;
    const explainData = explainArtifact.status === 'fulfilled'
      ? explainArtifact.value.data as ExplanationArtifact : null;

    const confidences = {
      forecast: forecastArtifact.status === 'fulfilled' ? forecastArtifact.value.confidence : 0,
      simulation: simulationArtifact.status === 'fulfilled' ? simulationArtifact.value.confidence : 0,
      explanation: explainArtifact.status === 'fulfilled' ? explainArtifact.value.confidence : 0,
    };

    const avgConfidence = (confidences.forecast + confidences.simulation + confidences.explanation) / 3;

    const { dag } = await loadExecutionContext();

    // Build composite narrative
    const narrativeParts: string[] = [];
    narrativeParts.push(`Composite analysis of ${domain} (${horizonDays}-day horizon):`);

    if (forecastData) {
      const fc = forecastArtifact.status === 'fulfilled' ? forecastArtifact.value : null;
      narrativeParts.push(`\n📊 FORECAST: ${fc?.narrative || 'Forecast completed.'}`);
    }
    if (simData) {
      const sim = simulationArtifact.status === 'fulfilled' ? simulationArtifact.value : null;
      narrativeParts.push(`\n🎯 SCENARIO: ${sim?.narrative || 'Simulation completed.'}`);
    }
    if (explainData) {
      const exp = explainArtifact.status === 'fulfilled' ? explainArtifact.value : null;
      narrativeParts.push(`\n🔍 EXPLANATION: ${exp?.narrative || 'Explanation completed.'}`);
    }

    const modulesUsed = new Set<string>();
    if (forecastArtifact.status === 'fulfilled') forecastArtifact.value.metadata.modulesUsed.forEach(m => modulesUsed.add(m));
    if (simulationArtifact.status === 'fulfilled') simulationArtifact.value.metadata.modulesUsed.forEach(m => modulesUsed.add(m));
    if (explainArtifact.status === 'fulfilled') explainArtifact.value.metadata.modulesUsed.forEach(m => modulesUsed.add(m));

    return {
      actionType: 'composite',
      domain,
      data: {
        type: 'composite',
        forecast: forecastData,
        simulation: simData,
        explanation: explainData,
        confidences,
      },
      narrative: narrativeParts.join('\n'),
      confidence: avgConfidence,
      confidenceGated: false,
      durationMs: Date.now() - start,
      horizonDays,
      metadata: {
        modulesUsed: Array.from(modulesUsed),
        dagNodeCount: dag.nodes.size,
        dagEdgeCount: countEdges(dag),
        timeSeriesDomainsLoaded: (cachedTimeSeries?.size || 0),
        executedAt: new Date().toISOString(),
        llmNarrativeUsed: false,
        forecastedDomains: forecastData?.relatedForecasts
          ? [domain, ...forecastData.relatedForecasts.map(rf => rf.domain)]
          : [domain],
        horizonSource,
      },
    };
  }

  // ── Main Dispatch ───────────────────────────────────────────────────

  async function execute(
    question: string,
    knowledge: ActionKnowledgeContext,
    overrideHorizonDays?: number,
  ): Promise<ActionArtifact> {
    const executeStart = Date.now();
    const actionType = routeToAction(knowledge.intent, question);
    const domain = knowledge.primaryDomain;

    // V2: Smart horizon detection
    let horizonDays: number;
    let horizonSource: 'parsed' | 'default' | 'override';

    if (overrideHorizonDays) {
      horizonDays = overrideHorizonDays;
      horizonSource = 'override';
    } else {
      const parsed = parseHorizonFromQuestion(question);
      horizonDays = parsed.days > 0 ? parsed.days : defaultForecastHorizonDays;
      horizonSource = parsed.source;
    }

    log(`Routing: intent=${knowledge.intent} → action=${actionType}, domain=${domain}, horizon=${horizonDays}d (${horizonSource})`);

    try {
      let artifact: ActionArtifact;

      switch (actionType) {
        case 'forecast':
          artifact = await executeForecast(domain, knowledge, horizonDays, horizonSource);
          break;
        case 'simulate': {
          const scenario = parseWhatIfScenario(question, knowledge.extractedDomains);
          artifact = await executeSimulation(scenario, horizonDays, horizonSource);
          break;
        }
        case 'explain':
          artifact = await executeExplain(domain, knowledge, horizonDays, horizonSource);
          break;
        case 'diagnose':
          artifact = await executeDiagnose(domain, knowledge, horizonDays, horizonSource);
          break;
        case 'composite':
          artifact = await executeComposite(domain, knowledge, horizonDays, horizonSource, question);
          break;
      }

      // V2: Apply confidence gating
      artifact = applyConfidenceGate(artifact);

      // V2: LLM narrative enrichment (async, non-blocking — fall back to template)
      if (amplifier && !artifact.confidenceGated) {
        try {
          const llmNarrative = await generateLLMNarrative(artifact, question);
          artifact = {
            ...artifact,
            narrative: llmNarrative,
            metadata: { ...artifact.metadata, llmNarrativeUsed: true },
          };
        } catch (err) {
          log('LLM narrative enrichment failed (using template):', err);
        }
      }

      return artifact;
    } catch (err) {
      // Graceful degradation: return a minimal artifact on failure
      log(`Action execution failed (${actionType}):`, err);
      return {
        actionType,
        domain,
        data: buildFailsafeData(actionType, domain),
        narrative: `Unable to complete ${actionType} for ${domain}. The brain needs more signal data to produce executable results.`,
        confidence: 0,
        confidenceGated: true,
        durationMs: Date.now() - executeStart,
        horizonDays,
        metadata: {
          modulesUsed: [],
          dagNodeCount: 0,
          dagEdgeCount: 0,
          timeSeriesDomainsLoaded: 0,
          executedAt: new Date().toISOString(),
          llmNarrativeUsed: false,
          horizonSource,
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
    relatedForecasts: ForecastArtifact['relatedForecasts'],
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

    // V2: Include related domain forecasts in narrative
    if (relatedForecasts.length > 0) {
      parts.push(`\nMulti-domain view: Also forecasted ${relatedForecasts.map(rf => `${rf.domain} (${(rf.confidence * 100).toFixed(0)}%)`).join(', ')}.`);
    }

    return parts.join(' ');
  }

  function buildExplanationNarrative(
    domain: string,
    primaryAnalysis: ConnectionAnalysis | null,
    chain: ExplanationChain | null,
    upstreamAnalyses: ConnectionAnalysis[],
    downstreamAnalyses: ConnectionAnalysis[],
  ): string {
    const parts: string[] = [];

    if (primaryAnalysis) {
      parts.push(primaryAnalysis.executiveSummary);
    } else if (chain?.narrative) {
      parts.push(chain.narrative);
    } else {
      parts.push(`Analysis of ${domain}:`);
    }

    if (upstreamAnalyses.length > 0) {
      parts.push(`\nUpstream drivers (${upstreamAnalyses.length}): ${upstreamAnalyses.map(a => `${a.source} (${(a.confidence * 100).toFixed(0)}%)`).join(', ')}.`);
    }

    if (downstreamAnalyses.length > 0) {
      parts.push(`Downstream effects (${downstreamAnalyses.length}): ${downstreamAnalyses.map(a => `${a.target} (${(a.confidence * 100).toFixed(0)}%)`).join(', ')}.`);
    }

    if (chain?.steps && chain.steps.length > 0) {
      parts.push(`\nReasoning chain: ${chain.steps.length} steps.`);
      for (const step of chain.steps.slice(0, 3)) {
        parts.push(`  ${step.stepNum}. ${step.inference}`);
      }
    }

    if (chain?.suggestedActions && chain.suggestedActions.length > 0) {
      parts.push(`\nSuggested actions: ${chain.suggestedActions.slice(0, 3).join('; ')}.`);
    }

    return parts.join(' ');
  }

  function buildDiagnosisNarrative(
    domain: string,
    anomalyExplanation: AnomalyExplanation | null,
    upstreamAnalyses: ConnectionAnalysis[],
    triggeredRules: Array<{ title: string; naturalLanguage: string; matchedConditions: string[] }>,
  ): string {
    const parts: string[] = [];

    if (anomalyExplanation?.mostLikelyCause) {
      const cause = anomalyExplanation.mostLikelyCause;
      parts.push(`Root cause for ${domain}: ${cause.domain} (confidence: ${(cause.confidence * 100).toFixed(0)}%, lag: ${cause.lagDays}d). ${cause.explanation}`);
    } else {
      parts.push(`Diagnosis of ${domain}:`);
    }

    if (anomalyExplanation?.alternativeCauses && anomalyExplanation.alternativeCauses.length > 0) {
      parts.push(`\nAlternative causes: ${anomalyExplanation.alternativeCauses.map(c => `${c.domain} (${(c.confidence * 100).toFixed(0)}%)`).join(', ')}.`);
    }

    if (upstreamAnalyses.length > 0) {
      parts.push(`\n${upstreamAnalyses.length} upstream drivers analyzed: ${upstreamAnalyses.map(a => a.source).join(', ')}.`);
    }

    if (triggeredRules.length > 0) {
      parts.push(`\n${triggeredRules.length} business rules fired: ${triggeredRules.map(r => r.title).join(', ')}.`);
    }

    if (anomalyExplanation?.prescriptiveActions && anomalyExplanation.prescriptiveActions.length > 0) {
      parts.push(`\nPrescriptive actions: ${anomalyExplanation.prescriptiveActions.map(a => a.action).join('; ')}.`);
    }

    return parts.join(' ');
  }

  function buildFailsafeData(actionType: ActionType, domain: string): ActionArtifact['data'] {
    switch (actionType) {
      case 'forecast':
        return {
          type: 'forecast',
          forecast: { domain, horizonDays: 0, predictions: [], upstreamDrivers: [], confidence: 0, summary: 'Insufficient data for forecast' },
          driverAnalyses: [], table: [], drivers: [], relatedForecasts: [],
        } as ForecastArtifact;
      case 'simulate':
        return {
          type: 'simulation',
          simulation: {
            scenario: { sourceDomain: domain, direction: 'increase', magnitudePercent: 0 },
            cascadePaths: [], timeline: [], affectedDomains: [],
            totalImpactPercent: 0, overallConfidence: 0, interventions: [],
            narrative: 'Simulation could not be completed', durationMs: 0,
          },
          timeline: [], interventions: [],
        } as SimulationArtifact;
      case 'explain':
        return {
          type: 'explanation',
          explanationChain: null, connectionAnalysis: null,
          allUpstreamAnalyses: [], allDownstreamAnalyses: [],
        } as ExplanationArtifact;
      case 'diagnose':
        return {
          type: 'diagnosis',
          anomalyExplanation: null, upstreamAnalyses: [], triggeredRules: [],
        } as DiagnosisArtifact;
      case 'composite':
        return {
          type: 'composite',
          forecast: null, simulation: null, explanation: null,
          confidences: { forecast: 0, simulation: 0, explanation: 0 },
        } as CompositeArtifact;
    }
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
    /** V2: Composite execution (forecast + simulate + explain) */
    executeComposite,
    /** Route a question to an action type without executing */
    routeToAction,
    /** Parse a what-if scenario from natural language */
    parseWhatIfScenario,
    /** V2: Parse horizon from natural language */
    parseHorizonFromQuestion: (q: string) => parseHorizonFromQuestion(q),
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
 *
 * V2: Enhanced with multi-domain forecasts, composite data, confidence gates,
 *     and horizon information.
 */
export function formatArtifactForPrompt(artifact: ActionArtifact): string {
  const parts: string[] = [];

  parts.push(`Action: ${artifact.actionType} | Domain: ${artifact.domain} | Confidence: ${(artifact.confidence * 100).toFixed(0)}% | Horizon: ${artifact.horizonDays}d (${artifact.metadata.horizonSource})`);
  parts.push(`Modules: ${artifact.metadata.modulesUsed.join(', ')} | DAG: ${artifact.metadata.dagNodeCount} nodes, ${artifact.metadata.dagEdgeCount} edges`);

  if (artifact.confidenceGated) {
    parts.push(`\n⚠️ LOW CONFIDENCE WARNING: Results are below the confidence threshold. The brain needs more signal data for "${artifact.domain}". Present these results with appropriate caveats.`);
  }

  parts.push('');

  if (artifact.data.type === 'forecast') {
    formatForecastForPrompt(artifact.data as ForecastArtifact, parts, artifact.horizonDays);
  }

  if (artifact.data.type === 'simulation') {
    formatSimulationForPrompt(artifact.data as SimulationArtifact, parts);
  }

  if (artifact.data.type === 'explanation') {
    formatExplanationForPrompt(artifact.data as ExplanationArtifact, parts);
  }

  if (artifact.data.type === 'diagnosis') {
    formatDiagnosisForPrompt(artifact.data as DiagnosisArtifact, artifact.domain, parts);
  }

  if (artifact.data.type === 'composite') {
    formatCompositeForPrompt(artifact.data as CompositeArtifact, artifact, parts);
  }

  return parts.join('\n');
}

function formatForecastForPrompt(fd: ForecastArtifact, parts: string[], horizonDays: number): void {
  parts.push(`## Forecast Results (${horizonDays} days)`);
  parts.push(fd.forecast.summary);
  parts.push('');

  if (fd.table.length > 0) {
    parts.push('| Date | Predicted | Lower95 | Upper95 |');
    parts.push('|------|-----------|---------|---------|');
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

  // V2: Related domain forecasts
  if (fd.relatedForecasts.length > 0) {
    parts.push('');
    parts.push('## Related Domain Forecasts (Multi-Domain View)');
    for (const rf of fd.relatedForecasts) {
      parts.push(`\n### ${rf.domain} (confidence: ${(rf.confidence * 100).toFixed(0)}%)`);
      parts.push(rf.forecast.summary);
      if (rf.table.length > 0) {
        parts.push('| Date | Predicted | Lower95 | Upper95 |');
        parts.push('|------|-----------|---------|---------|');
        const toShow = rf.table.length <= 5 ? rf.table : [...rf.table.slice(0, 3), ...rf.table.slice(-2)];
        for (const row of toShow) {
          parts.push(`| ${row.date} | ${row.predicted.toFixed(4)} | ${row.lower95.toFixed(4)} | ${row.upper95.toFixed(4)} |`);
        }
        if (rf.table.length > 5) {
          parts.push(`... (${rf.table.length - 5} more rows)`);
        }
      }
    }
  }
}

function formatSimulationForPrompt(sd: SimulationArtifact, parts: string[]): void {
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

function formatExplanationForPrompt(ed: ExplanationArtifact, parts: string[]): void {
  if (ed.connectionAnalysis) {
    parts.push(`## Connection Analysis: ${ed.connectionAnalysis.source} → ${ed.connectionAnalysis.target}`);
    parts.push(ed.connectionAnalysis.executiveSummary);
  }

  // V2: Show ALL upstream analyses
  if (ed.allUpstreamAnalyses.length > 0) {
    parts.push('');
    parts.push(`### All Upstream Drivers (${ed.allUpstreamAnalyses.length}):`);
    for (const ua of ed.allUpstreamAnalyses) {
      parts.push(`  - ${ua.source} → ${ua.target}: ${ua.executiveSummary} (confidence: ${(ua.confidence * 100).toFixed(0)}%)`);
    }
  }

  // V2: Show ALL downstream analyses
  if (ed.allDownstreamAnalyses.length > 0) {
    parts.push('');
    parts.push(`### All Downstream Effects (${ed.allDownstreamAnalyses.length}):`);
    for (const da of ed.allDownstreamAnalyses) {
      parts.push(`  - ${da.source} → ${da.target}: ${da.executiveSummary} (confidence: ${(da.confidence * 100).toFixed(0)}%)`);
    }
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

function formatDiagnosisForPrompt(dd: DiagnosisArtifact, domain: string, parts: string[]): void {
  parts.push(`## Diagnosis of ${domain}`);

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

function formatCompositeForPrompt(cd: CompositeArtifact, artifact: ActionArtifact, parts: string[]): void {
  parts.push(`## Composite Analysis: ${artifact.domain} (${artifact.horizonDays}-day horizon)`);
  parts.push(`Confidences — Forecast: ${(cd.confidences.forecast * 100).toFixed(0)}% | Simulation: ${(cd.confidences.simulation * 100).toFixed(0)}% | Explanation: ${(cd.confidences.explanation * 100).toFixed(0)}%`);
  parts.push('');

  if (cd.forecast) {
    parts.push('### Forecast Component');
    formatForecastForPrompt(cd.forecast, parts, artifact.horizonDays);
    parts.push('');
  }

  if (cd.simulation) {
    parts.push('### Simulation Component');
    formatSimulationForPrompt(cd.simulation, parts);
    parts.push('');
  }

  if (cd.explanation) {
    parts.push('### Explanation Component');
    formatExplanationForPrompt(cd.explanation, parts);
  }
}
