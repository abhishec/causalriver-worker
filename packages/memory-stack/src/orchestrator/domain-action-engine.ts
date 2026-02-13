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
  /** V3: Execution playbook — what to actually DO about the findings */
  playbook: ExecutionPlaybook | null;
  /** V3: Outcome contract — what this artifact guarantees */
  outcomeContract: OutcomeContract;
  /** V4: Meta-cognitive self-assessment — the brain's honest evaluation of its own reasoning */
  metaCognition: MetaCognitiveAssessment | null;
  /** V4: Counterfactual analysis — stress-testing recommendations against alternative scenarios */
  counterfactuals: CounterfactualAnalysis | null;
  /** V4: Adaptive layer — pre-planned pivots and learning agenda for the playbook */
  adaptiveLayer: AdaptiveLayer | null;
  /** V4: Decision journal entry — logged for future calibration and learning */
  decisionJournal: DecisionJournalEntry | null;
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

// ============================================================================
// V3: EXECUTION PLAYBOOK + OUTCOME CONTRACT ("Closed Fist")
// ============================================================================

/** V3: The execution playbook — what to actually DO about the brain's findings.
 *  Converts statistical insights into phased, actionable plans with owners,
 *  KPIs, milestones, and risk mitigations. */
export interface ExecutionPlaybook {
  /** Executive summary: 1-2 sentence "here's what to do" */
  executiveSummary: string;
  /** The single most important action to take RIGHT NOW */
  mondayMorningAction: string;
  /** Strategic interventions ranked by expected impact */
  interventions: StrategicIntervention[];
  /** Phased execution plan with milestones */
  phases: PlaybookPhase[];
  /** Risks and mitigations */
  risks: PlaybookRisk[];
  /** How to know if the plan is working */
  successMetrics: PlaybookKPI[];
  /** Confidence in the playbook (0-1) */
  confidence: number;
  /** Whether this playbook was LLM-generated (true) or template-generated (false) */
  isLLMGenerated: boolean;
}

/** A specific, actionable intervention derived from brain computation */
export interface StrategicIntervention {
  /** What to do (1-2 sentences, specific) */
  action: string;
  /** Which domain(s) this targets */
  targetDomains: string[];
  /** Expected impact (e.g., "+18% revenue", "-25% churn") */
  expectedImpact: string;
  /** Time to see results */
  timeToImpactDays: number;
  /** Which team/role owns this */
  owner: string;
  /** Estimated effort/cost */
  effort: 'low' | 'medium' | 'high';
  /** Confidence in this intervention (0-1) */
  confidence: number;
  /** What brain evidence supports this */
  evidence: string;
}

/** A phase in the execution plan */
export interface PlaybookPhase {
  /** Phase name (e.g., "Immediate (Week 1)") */
  name: string;
  /** Phase number (1-based) */
  phase: number;
  /** Relative timeline */
  timeframe: string;
  /** What to accomplish in this phase */
  activities: string[];
  /** Milestones that gate moving to next phase */
  milestones: PlaybookMilestone[];
  /** Dependencies on other phases or external factors */
  dependencies: string[];
}

/** A checkpoint within a phase */
export interface PlaybookMilestone {
  /** What to check */
  milestone: string;
  /** How to measure success */
  criteria: string;
  /** Who verifies */
  owner: string;
}

/** An identified risk with mitigation strategy */
export interface PlaybookRisk {
  /** What could go wrong */
  risk: string;
  /** How bad (impact × probability) */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** What to do about it */
  mitigation: string;
  /** Fallback if mitigation fails */
  contingency: string;
}

/** A KPI to track whether the plan is working */
export interface PlaybookKPI {
  /** Metric name */
  metric: string;
  /** Current value (from brain data) */
  currentValue: string;
  /** Target value */
  targetValue: string;
  /** When to measure */
  measureBy: string;
  /** Which domain this tracks */
  domain: string;
}

/** V3: Outcome Contract — what this artifact guarantees to deliver */
export interface OutcomeContract {
  /** What was asked */
  question: string;
  /** What was delivered */
  deliveredOutcome: string;
  /** What type of deliverable this is */
  deliverableType: 'forecast_model' | 'scenario_analysis' | 'causal_explanation' | 'root_cause_diagnosis' | 'comprehensive_model' | 'execution_playbook';
  /** Whether we delivered fully, partially, or couldn't */
  fulfillment: 'full' | 'partial' | 'insufficient_data';
  /** If partial/insufficient, why */
  gaps?: string[];
  /** What data would be needed to improve */
  dataNeeded?: string[];
  /** Brain modules that contributed */
  modulesUsed: string[];
  /** Was this from real brain data or fallback? */
  computedFromRealData: boolean;
}

// ============================================================================
// V4: DECISION INTELLIGENCE — "The Brain That Thinks About Thinking"
// ============================================================================

/** V4: Meta-cognitive assessment — the brain's honest self-evaluation of its own reasoning.
 *  Neuroscience analog: Anterior cingulate cortex (ACC) + dorsolateral prefrontal cortex (dlPFC)
 *  — the regions that detect errors, monitor conflicts, and regulate confidence. */
export interface MetaCognitiveAssessment {
  /** How well does the brain understand this domain? (0-1) */
  domainMastery: number;
  /** What reasoning approach did the brain use? */
  reasoningStrategy: 'data_driven' | 'model_driven' | 'analogy_driven' | 'rule_driven' | 'hybrid';
  /** What the brain is confident about */
  confidenceAnchors: string[];
  /** What the brain is uncertain about (honest blindspots) */
  blindSpots: string[];
  /** How the brain's reasoning could be wrong (steel-man the counter-argument) */
  devilsAdvocate: string;
  /** What would change the brain's mind (falsification criteria) */
  falsificationCriteria: string[];
  /** Alternative interpretations the brain considered but ranked lower */
  alternativeHypotheses: AlternativeHypothesis[];
  /** Information value: what single piece of data would most improve this analysis? */
  highestValueQuestion: string;
  /** Reasoning chain transparency: the actual computational path taken */
  reasoningTrace: ReasoningTraceStep[];
}

/** An alternative interpretation the brain considered */
export interface AlternativeHypothesis {
  /** The alternative explanation */
  hypothesis: string;
  /** Why the brain ranked it lower */
  whyRankedLower: string;
  /** What evidence would elevate this hypothesis */
  evidenceNeeded: string;
  /** Probability assigned (0-1) */
  probability: number;
}

/** A step in the brain's actual reasoning process */
export interface ReasoningTraceStep {
  /** Step number */
  step: number;
  /** What the brain did */
  action: string;
  /** What module performed this step */
  module: string;
  /** What input went in */
  input: string;
  /** What came out */
  output: string;
  /** How long this step took (ms) */
  durationMs: number;
}

/** V4: Counterfactual analysis — "what if we had done X differently?" or "what if the world were different?"
 *  Neuroscience analog: Hippocampus (episodic memory) + prefrontal cortex (simulation)
 *  — the brain imagines alternative pasts and futures to stress-test its recommendations. */
export interface CounterfactualAnalysis {
  /** The baseline scenario (what the brain actually computed) */
  baseline: CounterfactualScenario;
  /** Alternative scenarios: what if key assumptions changed? */
  alternatives: CounterfactualScenario[];
  /** The single most important assumption that, if wrong, changes everything */
  criticalAssumption: string;
  /** Sensitivity: which input variable has the highest leverage on the outcome? */
  highestLeverageVariable: {
    variable: string;
    domain: string;
    /** How much does a 10% change in this variable affect the outcome? */
    sensitivityPercent: number;
    /** Direction of influence */
    direction: 'positive' | 'negative' | 'nonlinear';
  };
  /** Regret analysis: what's the cost of being wrong? */
  regretAnalysis: {
    /** Best case if we follow the playbook and it's right */
    bestCase: string;
    /** Worst case if we follow the playbook and it's wrong */
    worstCase: string;
    /** Cost of inaction (doing nothing) */
    inactionCost: string;
    /** Whether the playbook is still worth following given uncertainty */
    recommendation: 'proceed' | 'proceed_with_caution' | 'gather_more_data' | 'reconsider';
  };
}

/** A scenario in counterfactual analysis */
export interface CounterfactualScenario {
  /** Scenario label */
  label: string;
  /** What's different from baseline */
  assumption: string;
  /** Expected outcome under this scenario */
  expectedOutcome: string;
  /** Probability of this scenario (0-1) */
  probability: number;
  /** Impact on the playbook's recommended actions */
  playbookImpact: 'unchanged' | 'minor_adjustment' | 'major_revision' | 'abandon';
}

/** V4: Decision Journal Entry — records the decision context for future learning.
 *  The brain logs every major recommendation so it can later compare predictions
 *  to outcomes and calibrate its reasoning. */
export interface DecisionJournalEntry {
  /** When this decision was made */
  timestamp: string;
  /** The question that triggered this analysis */
  question: string;
  /** What the brain recommended */
  recommendation: string;
  /** The Monday Morning Action */
  mondayMorningAction: string;
  /** Key assumptions behind the recommendation */
  assumptions: string[];
  /** What the brain predicted would happen */
  predictedOutcome: string;
  /** When to check if the prediction came true */
  reviewDate: string;
  /** The confidence at time of decision */
  confidenceAtDecision: number;
  /** What would prove the brain wrong */
  falsificationCriteria: string[];
  /** Domain and action type for categorization */
  domain: string;
  actionType: ActionType;
  /** Artifact confidence breakdown */
  confidenceBreakdown: {
    dataQuality: number;
    modelFit: number;
    domainCoverage: number;
    overall: number;
  };
}

/** V4: Adaptive Playbook — a playbook that includes pre-planned adaptations
 *  based on what Phase 1 might reveal. Real brains don't just plan — they
 *  plan what to do when the plan fails. */
export interface AdaptiveLayer {
  /** Pre-planned pivots: if X happens in Phase 1, do Y instead of Z in Phase 2 */
  contingencyTriggers: ContingencyTrigger[];
  /** Signals that should trigger a full re-analysis */
  reanalysisSignals: string[];
  /** The learning agenda: what questions should each phase answer? */
  learningAgenda: LearningQuestion[];
  /** Decision gates: what must be true to proceed to the next phase? */
  decisionGates: DecisionGate[];
}

/** A pre-planned contingency: if X, then Y */
export interface ContingencyTrigger {
  /** What to watch for */
  trigger: string;
  /** Which phase this applies to */
  phase: number;
  /** What to do if triggered */
  action: string;
  /** How this changes the overall playbook */
  playbookRevision: string;
}

/** A question that a phase should answer for the brain to learn */
export interface LearningQuestion {
  /** The question */
  question: string;
  /** Which phase should answer it */
  phase: number;
  /** How to measure the answer */
  measurement: string;
  /** What the brain currently assumes the answer is */
  currentAssumption: string;
}

/** A go/no-go decision point between phases */
export interface DecisionGate {
  /** Gate name */
  name: string;
  /** Between which phases */
  betweenPhases: [number, number];
  /** Criteria to proceed */
  proceedCriteria: string[];
  /** What to do if criteria not met */
  fallbackAction: string;
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
      playbook: null,
      outcomeContract: null as unknown as OutcomeContract, // Set by execute()
      metaCognition: null,
      counterfactuals: null,
      adaptiveLayer: null,
      decisionJournal: null,
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
      playbook: null,
      outcomeContract: null as unknown as OutcomeContract, // Set by execute()
      metaCognition: null,
      counterfactuals: null,
      adaptiveLayer: null,
      decisionJournal: null,
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
      playbook: null,
      outcomeContract: null as unknown as OutcomeContract, // Set by execute()
      metaCognition: null,
      counterfactuals: null,
      adaptiveLayer: null,
      decisionJournal: null,
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
      playbook: null,
      outcomeContract: null as unknown as OutcomeContract, // Set by execute()
      metaCognition: null,
      counterfactuals: null,
      adaptiveLayer: null,
      decisionJournal: null,
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
      playbook: null,
      outcomeContract: null as unknown as OutcomeContract, // Set by execute()
      metaCognition: null,
      counterfactuals: null,
      adaptiveLayer: null,
      decisionJournal: null,
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

  // ── V3: Outcome Contract Builder ──────────────────────────────────────

  function buildOutcomeContract(
    question: string,
    artifact: { actionType: ActionType; domain: string; confidence: number; confidenceGated: boolean; metadata: ActionArtifact['metadata'] },
  ): OutcomeContract {
    const deliverableTypeMap: Record<ActionType, OutcomeContract['deliverableType']> = {
      forecast: 'forecast_model',
      simulate: 'scenario_analysis',
      explain: 'causal_explanation',
      diagnose: 'root_cause_diagnosis',
      composite: 'comprehensive_model',
    };

    let fulfillment: OutcomeContract['fulfillment'];
    const gaps: string[] = [];
    const dataNeeded: string[] = [];

    if (artifact.confidence >= 0.5) {
      fulfillment = 'full';
    } else if (artifact.confidence >= confidenceThreshold) {
      fulfillment = 'partial';
      if (artifact.confidence < 0.35) {
        gaps.push(`Confidence is ${(artifact.confidence * 100).toFixed(0)}% — moderate but could improve with more signal data`);
      }
      if (artifact.metadata.dagEdgeCount < 10) {
        gaps.push(`Causal graph has only ${artifact.metadata.dagEdgeCount} edges — more domain training would strengthen results`);
        dataNeeded.push('Additional cross-domain signal data to strengthen the causal graph');
      }
      if (artifact.metadata.timeSeriesDomainsLoaded < 5) {
        gaps.push(`Only ${artifact.metadata.timeSeriesDomainsLoaded} time series domains available — broader coverage would improve forecasts`);
        dataNeeded.push('Time series data from more business domains');
      }
    } else {
      fulfillment = 'insufficient_data';
      gaps.push(`Confidence is ${(artifact.confidence * 100).toFixed(0)}% — below ${(confidenceThreshold * 100).toFixed(0)}% threshold`);
      if (artifact.metadata.dagEdgeCount === 0) {
        gaps.push('No causal edges found — the brain has no learned relationships for this domain');
        dataNeeded.push('Train the brain with domain-specific data packs');
      }
      if (artifact.metadata.timeSeriesDomainsLoaded === 0) {
        gaps.push('No time series data available for forecasting');
        dataNeeded.push('Ingest cross-domain signals (connect data sources or upload CSV)');
      }
      dataNeeded.push(`More signal data for the "${artifact.domain}" domain`);
    }

    return {
      question,
      deliveredOutcome: fulfillment === 'full'
        ? `Complete ${artifact.actionType} analysis of ${artifact.domain} with ${(artifact.confidence * 100).toFixed(0)}% confidence`
        : fulfillment === 'partial'
          ? `Partial ${artifact.actionType} analysis of ${artifact.domain} — results available but confidence is limited`
          : `Unable to produce reliable ${artifact.actionType} for ${artifact.domain} — insufficient signal data`,
      deliverableType: deliverableTypeMap[artifact.actionType],
      fulfillment,
      ...(gaps.length > 0 ? { gaps } : {}),
      ...(dataNeeded.length > 0 ? { dataNeeded } : {}),
      modulesUsed: artifact.metadata.modulesUsed,
      computedFromRealData: artifact.metadata.dagNodeCount > 0 && artifact.metadata.timeSeriesDomainsLoaded > 0,
    };
  }

  // ── V3: Template Playbook Builder ──────────────────────────────────────

  function buildTemplatePlaybook(
    artifact: ActionArtifact,
    question: string,
  ): ExecutionPlaybook {
    const { domain, actionType, confidence, horizonDays } = artifact;
    const confidencePct = (confidence * 100).toFixed(0);

    // ── Build interventions from artifact data ──
    const interventions: StrategicIntervention[] = [];

    if (artifact.data.type === 'forecast') {
      const fd = artifact.data as ForecastArtifact;
      for (const driver of fd.drivers.slice(0, 3)) {
        interventions.push({
          action: `Optimize ${driver.domain} to improve ${domain} — the brain found a ${(driver.weight * 100).toFixed(0)}% causal influence with ${driver.lagDays}-day lag`,
          targetDomains: [driver.domain, domain],
          expectedImpact: `${(driver.contribution * 100).toFixed(0)}% contribution to ${domain} trajectory`,
          timeToImpactDays: driver.lagDays,
          owner: mapDomainToOwner(driver.domain),
          effort: driver.weight > 0.5 ? 'high' : driver.weight > 0.2 ? 'medium' : 'low',
          confidence: confidence * driver.weight,
          evidence: `Causal edge: ${driver.domain}→${domain}, weight=${driver.weight.toFixed(2)}, lag=${driver.lagDays}d`,
        });
      }
    }

    if (artifact.data.type === 'simulation') {
      const sd = artifact.data as SimulationArtifact;
      for (const iv of sd.interventions.slice(0, 3)) {
        interventions.push({
          action: iv.suggestedAction,
          targetDomains: [iv.domain],
          expectedImpact: `${(iv.effectiveness * 100).toFixed(0)}% effectiveness if executed within ${iv.windowDays}-day window`,
          timeToImpactDays: iv.windowDays,
          owner: mapDomainToOwner(iv.domain),
          effort: iv.effectiveness > 0.6 ? 'high' : 'medium',
          confidence: confidence * iv.effectiveness,
          evidence: `Simulation intervention: window=${iv.windowDays}d, effectiveness=${(iv.effectiveness * 100).toFixed(0)}%`,
        });
      }
    }

    if (artifact.data.type === 'diagnosis') {
      const dd = artifact.data as DiagnosisArtifact;
      if (dd.anomalyExplanation?.prescriptiveActions) {
        for (const pa of dd.anomalyExplanation.prescriptiveActions.slice(0, 3)) {
          interventions.push({
            action: pa.action,
            targetDomains: [pa.targetEdge.source, pa.targetEdge.target],
            expectedImpact: pa.expectedImpact,
            timeToImpactDays: 14,
            owner: mapDomainToOwner(pa.targetEdge.source),
            effort: 'medium',
            confidence: pa.confidence,
            evidence: `Root cause: ${pa.targetEdge.source}→${pa.targetEdge.target}`,
          });
        }
      }
      for (const rule of dd.triggeredRules.slice(0, 2)) {
        interventions.push({
          action: `Address triggered rule: ${rule.title} — ${rule.naturalLanguage}`,
          targetDomains: [domain],
          expectedImpact: 'Rule-driven risk mitigation',
          timeToImpactDays: 7,
          owner: mapDomainToOwner(domain),
          effort: 'low',
          confidence: 0.7,
          evidence: `Rule fired: ${rule.matchedConditions.join(', ')}`,
        });
      }
    }

    if (artifact.data.type === 'composite') {
      const cd = artifact.data as CompositeArtifact;
      // Pull interventions from sub-artifacts
      if (cd.forecast) {
        for (const driver of cd.forecast.drivers.slice(0, 2)) {
          interventions.push({
            action: `Optimize ${driver.domain} lever — ${(driver.weight * 100).toFixed(0)}% causal influence on ${domain}`,
            targetDomains: [driver.domain, domain],
            expectedImpact: `${(driver.contribution * 100).toFixed(0)}% contribution (from forecast)`,
            timeToImpactDays: driver.lagDays,
            owner: mapDomainToOwner(driver.domain),
            effort: 'medium',
            confidence: cd.confidences.forecast * driver.weight,
            evidence: `Forecast driver: ${driver.domain}, weight=${driver.weight.toFixed(2)}`,
          });
        }
      }
      if (cd.simulation) {
        for (const iv of cd.simulation.interventions.slice(0, 2)) {
          interventions.push({
            action: iv.suggestedAction,
            targetDomains: [iv.domain],
            expectedImpact: `${(iv.effectiveness * 100).toFixed(0)}% effectiveness (from simulation)`,
            timeToImpactDays: iv.windowDays,
            owner: mapDomainToOwner(iv.domain),
            effort: 'medium',
            confidence: cd.confidences.simulation * iv.effectiveness,
            evidence: `Simulation intervention: window=${iv.windowDays}d`,
          });
        }
      }
    }

    // If explain type and we have no interventions yet, derive from connections
    if (artifact.data.type === 'explanation' && interventions.length === 0) {
      const ed = artifact.data as ExplanationArtifact;
      for (const ua of ed.allUpstreamAnalyses.slice(0, 2)) {
        if (ua.confidence > 0) {
          interventions.push({
            action: `Investigate the ${ua.source}→${ua.target} causal connection — ${ua.executiveSummary.slice(0, 100)}`,
            targetDomains: [ua.source, ua.target],
            expectedImpact: `${(ua.confidence * 100).toFixed(0)}% confidence causal path`,
            timeToImpactDays: 14,
            owner: mapDomainToOwner(ua.source),
            effort: 'low',
            confidence: ua.confidence,
            evidence: `Connection analysis: ${ua.source}→${ua.target}`,
          });
        }
      }
      if (ed.explanationChain?.suggestedActions) {
        for (const sa of ed.explanationChain.suggestedActions.slice(0, 2)) {
          interventions.push({
            action: sa,
            targetDomains: [domain],
            expectedImpact: 'Causal validation',
            timeToImpactDays: 7,
            owner: mapDomainToOwner(domain),
            effort: 'low',
            confidence: ed.explanationChain.confidence || 0.5,
            evidence: 'From explanation chain suggested actions',
          });
        }
      }
    }

    // ── Build phases ──
    const phases: PlaybookPhase[] = buildPhasesForActionType(actionType, domain, interventions, horizonDays);

    // ── Build Monday Morning Action ──
    const mondayMorningAction = buildMondayMorningAction(artifact, interventions);

    // ── Build KPIs ──
    const successMetrics: PlaybookKPI[] = [{
      metric: `${domain} confidence score`,
      currentValue: `${confidencePct}%`,
      targetValue: confidence < 0.5 ? '50%+' : '75%+',
      measureBy: `${Math.min(horizonDays, 30)} days`,
      domain,
    }];

    if (artifact.data.type === 'forecast') {
      const fd = artifact.data as ForecastArtifact;
      if (fd.table.length > 0) {
        const first = fd.table[0];
        const last = fd.table[fd.table.length - 1];
        successMetrics.push({
          metric: `${domain} forecast trajectory`,
          currentValue: first.predicted.toFixed(3),
          targetValue: last.predicted.toFixed(3),
          measureBy: last.date,
          domain,
        });
      }
    }

    if (artifact.data.type === 'simulation') {
      const sd = artifact.data as SimulationArtifact;
      successMetrics.push({
        metric: 'Total cascade impact',
        currentValue: '0%',
        targetValue: `< ${Math.abs(sd.simulation.totalImpactPercent).toFixed(1)}% (mitigated)`,
        measureBy: `${horizonDays} days`,
        domain,
      });
    }

    // ── Build risks ──
    const risks: PlaybookRisk[] = [];
    if (confidence < 0.5) {
      risks.push({
        risk: `Artifact confidence is ${confidencePct}% — results may shift with more data`,
        severity: confidence < 0.25 ? 'high' : 'medium',
        mitigation: 'Ingest more signal data and re-run analysis after next consolidation cycle',
        contingency: 'Use qualitative judgment alongside brain data until confidence improves',
      });
    }
    if (artifact.metadata.dagEdgeCount < 20) {
      risks.push({
        risk: `Causal graph has ${artifact.metadata.dagEdgeCount} edges — may miss important relationships`,
        severity: 'medium',
        mitigation: 'Train brain with additional domain packs to strengthen the causal graph',
        contingency: 'Supplement brain analysis with team expertise for uncovered domains',
      });
    }

    return {
      executiveSummary: `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} analysis of ${domain} completed at ${confidencePct}% confidence over ${horizonDays}-day horizon. ${interventions.length > 0 ? `${interventions.length} actionable interventions identified.` : 'Review the analysis to determine next steps.'}`,
      mondayMorningAction,
      interventions,
      phases,
      risks,
      successMetrics,
      confidence: confidence * 0.7, // Template playbooks are less confident than LLM-enriched
      isLLMGenerated: false,
    };
  }

  function mapDomainToOwner(domain: string): string {
    const ownerMap: Record<string, string> = {
      finance: 'CFO / Finance Lead',
      engineering: 'VP Engineering / Tech Lead',
      marketing: 'VP Marketing / Growth Lead',
      cs: 'VP Customer Success',
      product: 'VP Product / PM Lead',
      people: 'VP People / HR Lead',
      revenue: 'VP Sales / Revenue Lead',
      strategy: 'CEO / COO',
      growth: 'Growth Lead / CEO',
      macro: 'CFO / Strategy Lead',
      capex: 'CFO / Finance Lead',
      risk: 'CFO / Risk Lead',
      profitability: 'CFO / Finance Lead',
    };
    return ownerMap[domain] || `${domain.charAt(0).toUpperCase() + domain.slice(1)} Lead`;
  }

  function buildPhasesForActionType(
    actionType: ActionType,
    domain: string,
    interventions: StrategicIntervention[],
    horizonDays: number,
  ): PlaybookPhase[] {
    const phases: PlaybookPhase[] = [];

    // Phase 1: Always immediate (Week 1)
    const phase1Activities: string[] = [];
    const phase1Milestones: PlaybookMilestone[] = [];

    switch (actionType) {
      case 'forecast':
        phase1Activities.push(
          `Review ${domain} forecast results with the leadership team`,
          `Validate key driver assumptions with domain owners`,
          `Identify the top 1-2 levers to optimize based on driver analysis`,
        );
        phase1Milestones.push({
          milestone: 'Driver validation complete',
          criteria: 'Each driver assumption reviewed and confirmed or flagged',
          owner: mapDomainToOwner(domain),
        });
        break;
      case 'simulate':
        phase1Activities.push(
          `Brief leadership on the scenario analysis and cascade paths`,
          `Identify which intervention windows are still open`,
          `Assign intervention owners for each affected domain`,
        );
        phase1Milestones.push({
          milestone: 'Intervention owners assigned',
          criteria: 'Each intervention has a named owner and timeline',
          owner: mapDomainToOwner(domain),
        });
        break;
      case 'explain':
        phase1Activities.push(
          `Review the causal chain analysis with domain experts`,
          `Validate whether upstream drivers match team observations`,
          `Identify any connections that seem surprising or need investigation`,
        );
        phase1Milestones.push({
          milestone: 'Causal paths validated',
          criteria: 'Team confirms or disputes the top 3 causal connections',
          owner: mapDomainToOwner(domain),
        });
        break;
      case 'diagnose':
        phase1Activities.push(
          `Schedule root cause review with affected teams`,
          `Verify triggered rules against current operational reality`,
          `Confirm root cause hypothesis with recent data`,
        );
        phase1Milestones.push({
          milestone: 'Root cause confirmed or disputed',
          criteria: 'Team agrees on primary root cause with evidence',
          owner: mapDomainToOwner(domain),
        });
        break;
      case 'composite':
        phase1Activities.push(
          `Review the full model: forecast + scenario + causal analysis`,
          `Identify which component has highest confidence for decision-making`,
          `Prioritize interventions by expected impact × confidence`,
        );
        phase1Milestones.push({
          milestone: 'Prioritized action list created',
          criteria: 'Top 3 interventions agreed upon with owners',
          owner: 'CEO / COO',
        });
        break;
    }

    phases.push({
      name: 'Immediate (Week 1)',
      phase: 1,
      timeframe: 'Days 1-7',
      activities: phase1Activities,
      milestones: phase1Milestones,
      dependencies: [],
    });

    // Phase 2: Short-term execution
    const phase2Activities: string[] = interventions.slice(0, 3).map(
      iv => `Execute: ${iv.action} [Owner: ${iv.owner}]`
    );
    if (phase2Activities.length === 0) {
      phase2Activities.push(`Implement findings from Phase 1 analysis of ${domain}`);
    }

    phases.push({
      name: 'Execute (Weeks 2-4)',
      phase: 2,
      timeframe: 'Days 8-28',
      activities: phase2Activities,
      milestones: [{
        milestone: 'Interventions launched',
        criteria: 'All Phase 2 activities initiated with tracking in place',
        owner: mapDomainToOwner(domain),
      }],
      dependencies: ['Phase 1 milestones met'],
    });

    // Phase 3: Monitor and adjust
    const monitorTimeframe = horizonDays <= 30 ? 'Days 29-60' : `Days 29-${Math.min(horizonDays, 90)}`;
    phases.push({
      name: 'Monitor & Adjust',
      phase: 3,
      timeframe: monitorTimeframe,
      activities: [
        `Track KPIs against targets (re-run brain analysis to compare)`,
        `Adjust interventions based on early results`,
        `Feed outcomes back into the brain for learning cycle improvement`,
      ],
      milestones: [{
        milestone: 'Impact validated',
        criteria: 'KPIs show measurable movement toward targets',
        owner: mapDomainToOwner(domain),
      }],
      dependencies: ['Phase 2 interventions launched'],
    });

    return phases;
  }

  function buildMondayMorningAction(
    artifact: ActionArtifact,
    interventions: StrategicIntervention[],
  ): string {
    const { domain, actionType, confidence } = artifact;
    const confidencePct = (confidence * 100).toFixed(0);

    switch (actionType) {
      case 'forecast': {
        const fd = artifact.data as ForecastArtifact;
        const topDriver = fd.drivers[0];
        const trend = fd.table.length > 1
          ? (fd.table[fd.table.length - 1].predicted > fd.table[0].predicted ? 'upward' : 'downward')
          : 'stable';
        return topDriver
          ? `Review the ${domain} forecast with ${mapDomainToOwner(domain)} — the brain predicts ${trend} trajectory at ${confidencePct}% confidence. Focus on the ${topDriver.domain} lever (${(topDriver.weight * 100).toFixed(0)}% influence, ${topDriver.lagDays}d lag).`
          : `Review the ${domain} ${artifact.horizonDays}-day forecast with your team — ${confidencePct}% confidence, ${trend} trend.`;
      }
      case 'simulate': {
        const sd = artifact.data as SimulationArtifact;
        const topDomain = sd.timeline[0]?.domain || domain;
        const topChange = sd.timeline[0]?.predictedChangePercent?.toFixed(1) || '?';
        const topDay = sd.timeline[0]?.dayFromNow || '?';
        return `Brief your team: if the ${sd.simulation.scenario.sourceDomain} scenario plays out, ${topDomain} will see ${topChange}% change by day ${topDay}. Your first intervention window${sd.interventions[0] ? ` is ${sd.interventions[0].windowDays} days in ${sd.interventions[0].domain}` : ' needs identification'}.`;
      }
      case 'explain': {
        const ed = artifact.data as ExplanationArtifact;
        const topUpstream = ed.allUpstreamAnalyses[0];
        return topUpstream
          ? `Discuss the ${topUpstream.source}→${domain} causal link with ${mapDomainToOwner(topUpstream.source)} — the brain found a ${(topUpstream.confidence * 100).toFixed(0)}% confidence connection. Validate whether this matches your team's observations.`
          : `Review the ${domain} causal analysis with your team — ${ed.allUpstreamAnalyses.length} upstream and ${ed.allDownstreamAnalyses.length} downstream connections discovered.`;
      }
      case 'diagnose': {
        const dd = artifact.data as DiagnosisArtifact;
        if (dd.anomalyExplanation?.mostLikelyCause) {
          const cause = dd.anomalyExplanation.mostLikelyCause;
          return `Schedule a root cause review: ${cause.domain} is likely driving ${domain} issues (${(cause.confidence * 100).toFixed(0)}% confidence, ${cause.lagDays}d lag). ${dd.anomalyExplanation.prescriptiveActions[0]?.action || 'Investigate the connection.'}`;
        }
        return `Schedule a ${domain} diagnostic review with ${mapDomainToOwner(domain)} — ${dd.triggeredRules.length} rules fired, ${dd.upstreamAnalyses.length} upstream causes analyzed.`;
      }
      case 'composite':
        return `Start with the ${domain} forecast review, then scenario-plan the top risk, then align your team on the ${interventions.length > 0 ? interventions.length + ' identified interventions' : 'causal drivers'}. Block 90 minutes with leadership.`;
    }
  }

  // ── V3: LLM Playbook Upgrade ──────────────────────────────────────────

  async function upgradePlaybookWithLLM(
    templatePlaybook: ExecutionPlaybook,
    artifact: ActionArtifact,
    question: string,
  ): Promise<ExecutionPlaybook> {
    if (!amplifier) return templatePlaybook;

    try {
      // Format the artifact data for the LLM
      const formattedData = formatArtifactForPrompt(artifact);

      const llmPlaybook = await amplifier.generateExecutionPlaybook({
        actionType: artifact.actionType,
        domain: artifact.domain,
        question,
        confidence: artifact.confidence,
        horizonDays: artifact.horizonDays,
        narrative: artifact.narrative,
        formattedData,
      });

      // Merge: LLM playbook takes priority, but template fills any gaps
      return {
        executiveSummary: llmPlaybook.executiveSummary || templatePlaybook.executiveSummary,
        mondayMorningAction: llmPlaybook.mondayMorningAction || templatePlaybook.mondayMorningAction,
        interventions: llmPlaybook.interventions.length > 0
          ? llmPlaybook.interventions
          : templatePlaybook.interventions,
        phases: llmPlaybook.phases.length > 0
          ? llmPlaybook.phases
          : templatePlaybook.phases,
        risks: llmPlaybook.risks.length > 0
          ? llmPlaybook.risks
          : templatePlaybook.risks,
        successMetrics: llmPlaybook.successMetrics.length > 0
          ? llmPlaybook.successMetrics
          : templatePlaybook.successMetrics,
        confidence: llmPlaybook.confidence || templatePlaybook.confidence,
        isLLMGenerated: true,
      };
    } catch (err) {
      log('LLM playbook upgrade failed (using template):', err);
      return templatePlaybook;
    }
  }

  // ── V4: Meta-Cognitive Assessment Builder ───────────────────────────

  function buildMetaCognitiveAssessment(
    artifact: ActionArtifact,
    executionTimings: Array<{ step: string; module: string; input: string; output: string; durationMs: number }>,
  ): MetaCognitiveAssessment {
    const { domain, actionType, confidence, metadata } = artifact;

    // ── Domain Mastery: how well does the brain know this domain? ──
    const domainMastery = Math.min(1, (
      (metadata.dagEdgeCount > 0 ? 0.3 : 0) +
      (metadata.timeSeriesDomainsLoaded > 3 ? 0.2 : metadata.timeSeriesDomainsLoaded * 0.07) +
      (metadata.dagNodeCount > 10 ? 0.2 : metadata.dagNodeCount * 0.02) +
      (confidence > 0.5 ? 0.3 : confidence * 0.6)
    ));

    // ── Reasoning Strategy: classify what approach the brain took ──
    let reasoningStrategy: MetaCognitiveAssessment['reasoningStrategy'] = 'data_driven';
    if (actionType === 'explain') reasoningStrategy = 'model_driven';
    else if (actionType === 'diagnose') reasoningStrategy = 'rule_driven';
    else if (actionType === 'composite') reasoningStrategy = 'hybrid';
    else if (metadata.dagEdgeCount < 5 && metadata.timeSeriesDomainsLoaded > 3) reasoningStrategy = 'data_driven';
    else if (metadata.dagEdgeCount >= 5) reasoningStrategy = 'model_driven';

    // ── Confidence Anchors: what makes the brain confident ──
    const confidenceAnchors: string[] = [];
    if (metadata.dagEdgeCount > 15) confidenceAnchors.push(`Strong causal graph: ${metadata.dagEdgeCount} learned relationships`);
    if (metadata.timeSeriesDomainsLoaded > 5) confidenceAnchors.push(`Rich signal data: ${metadata.timeSeriesDomainsLoaded} time series loaded`);
    if (confidence > 0.6) confidenceAnchors.push(`Model confidence above 60% (${(confidence * 100).toFixed(0)}%)`);
    if (metadata.modulesUsed.length > 3) confidenceAnchors.push(`Multiple brain modules cross-validated: ${metadata.modulesUsed.join(', ')}`);
    if (artifact.data.type === 'forecast') {
      const fd = artifact.data as ForecastArtifact;
      if (fd.drivers.length > 2) confidenceAnchors.push(`${fd.drivers.length} upstream drivers discovered — multi-factor model`);
    }
    if (confidenceAnchors.length === 0) confidenceAnchors.push('Limited anchors — treat results as directional guidance, not firm predictions');

    // ── Blind Spots: what the brain doesn't know ──
    const blindSpots: string[] = [];
    if (metadata.dagEdgeCount < 10) blindSpots.push(`Sparse causal graph (${metadata.dagEdgeCount} edges) — may miss important relationships`);
    if (metadata.timeSeriesDomainsLoaded < 5) blindSpots.push(`Limited time series coverage (${metadata.timeSeriesDomainsLoaded} domains) — forecasts may lack context`);
    if (!metadata.llmNarrativeUsed) blindSpots.push('No LLM narrative enrichment — results lack semantic reasoning layer');
    if (actionType === 'forecast' && (artifact.data as ForecastArtifact).drivers.length === 0) {
      blindSpots.push('No upstream drivers found — forecast is based on autoregression only, not causal modeling');
    }
    blindSpots.push('External factors (regulation, competition, macroeconomic shifts) are not modeled');
    blindSpots.push('Human/organizational dynamics (morale, politics, culture) are outside the brain\'s sensor range');

    // ── Devil's Advocate: how could this analysis be wrong? ──
    const devilsAdvocate = buildDevilsAdvocate(artifact);

    // ── Falsification Criteria: what would change the brain's mind ──
    const falsificationCriteria: string[] = [];
    if (artifact.data.type === 'forecast') {
      const fd = artifact.data as ForecastArtifact;
      if (fd.table.length > 0) {
        const lastPredicted = fd.table[fd.table.length - 1].predicted;
        const firstPredicted = fd.table[0].predicted;
        const opposite = lastPredicted > firstPredicted ? 'decreases' : 'increases';
        falsificationCriteria.push(`If ${domain} ${opposite} by >15% within ${Math.ceil(artifact.horizonDays / 3)} days, this forecast is likely wrong`);
      }
      if (fd.drivers.length > 0) {
        falsificationCriteria.push(`If ${fd.drivers[0].domain} decouples from ${domain} (correlation drops below 0.1), the causal model needs revision`);
      }
    }
    if (artifact.data.type === 'simulation') {
      falsificationCriteria.push(`If the cascade doesn't begin within 2× the predicted timeline, the simulation overestimated propagation speed`);
    }
    if (artifact.data.type === 'diagnosis') {
      const dd = artifact.data as DiagnosisArtifact;
      if (dd.anomalyExplanation?.mostLikelyCause) {
        falsificationCriteria.push(`If fixing ${dd.anomalyExplanation.mostLikelyCause.domain} doesn't improve ${domain} within ${dd.anomalyExplanation.mostLikelyCause.lagDays * 2} days, the root cause is elsewhere`);
      }
    }
    falsificationCriteria.push(`If new data reduces confidence below ${(confidenceThreshold * 100).toFixed(0)}%, abandon this analysis and re-run`);

    // ── Alternative Hypotheses ──
    const alternativeHypotheses: AlternativeHypothesis[] = buildAlternativeHypotheses(artifact);

    // ── Highest Value Question ──
    const highestValueQuestion = buildHighestValueQuestion(artifact);

    // ── Reasoning Trace ──
    const reasoningTrace: ReasoningTraceStep[] = executionTimings.map((t, i) => ({
      step: i + 1,
      action: t.step,
      module: t.module,
      input: t.input,
      output: t.output,
      durationMs: t.durationMs,
    }));

    return {
      domainMastery,
      reasoningStrategy,
      confidenceAnchors,
      blindSpots,
      devilsAdvocate,
      falsificationCriteria,
      alternativeHypotheses,
      highestValueQuestion,
      reasoningTrace,
    };
  }

  function buildDevilsAdvocate(artifact: ActionArtifact): string {
    const { domain, actionType, confidence } = artifact;
    const confPct = (confidence * 100).toFixed(0);

    switch (actionType) {
      case 'forecast': {
        const fd = artifact.data as ForecastArtifact;
        const topDriver = fd.drivers[0];
        if (topDriver) {
          return `This forecast assumes ${topDriver.domain} continues to drive ${domain} (${(topDriver.weight * 100).toFixed(0)}% weight). But correlation is not causation — the ${topDriver.domain}→${domain} link could be confounded by a third variable the brain hasn't observed. At ${confPct}% confidence, there's a ${(100 - confidence * 100).toFixed(0)}% chance the trajectory looks completely different. If you're making a major investment based on this, validate the ${topDriver.domain} connection with domain experts first.`;
        }
        return `This forecast at ${confPct}% confidence is based on limited causal evidence. The brain is essentially extrapolating from past patterns, which is notoriously unreliable for startup metrics that can shift abruptly due to product launches, competitive moves, or market shifts.`;
      }
      case 'simulate': {
        const sd = artifact.data as SimulationArtifact;
        return `This simulation assumes cascades propagate linearly through the DAG, but real business impact is often nonlinear — small shocks can be absorbed, while threshold effects can amplify them unpredictably. The ${sd.simulation.scenario.sourceDomain} scenario uses fixed propagation weights, but in reality organizations adapt (or overreact). The ${(sd.simulation.totalImpactPercent).toFixed(1)}% total impact is a point estimate — the true range could be 2-5× wider.`;
      }
      case 'explain': {
        return `Causal explanations are the brain's most dangerous output — they feel true because they tell a coherent story, but the causal graph is trained on observational data, not experiments. Every ${domain} "cause" the brain identified could be a symptom of a deeper cause it hasn't observed. The reasoning chain should be treated as a hypothesis to test, not a conclusion to act on.`;
      }
      case 'diagnose': {
        const dd = artifact.data as DiagnosisArtifact;
        const cause = dd.anomalyExplanation?.mostLikelyCause;
        if (cause) {
          return `The brain identified ${cause.domain} as the root cause of ${domain} issues, but root cause analysis on observational data is notoriously unreliable. The true cause could be upstream of ${cause.domain} itself, or the correlation could be coincidental timing. Before investing in fixing ${cause.domain}, verify with a small experiment or natural variation.`;
        }
        return `The diagnosis is based on statistical patterns, not domain expertise. The brain may have identified symptoms rather than true root causes.`;
      }
      case 'composite':
        return `The composite model averages across forecast + simulation + explanation, which can create false confidence — if all three share the same blind spot (e.g., an unobserved confounding variable), averaging doesn't help. The composite appears more robust, but only if the sub-models are truly independent. Treat the highest-confidence component as the anchor and use the others to probe its weaknesses.`;
    }
  }

  function buildAlternativeHypotheses(artifact: ActionArtifact): AlternativeHypothesis[] {
    const alternatives: AlternativeHypothesis[] = [];
    const { domain, confidence } = artifact;

    if (artifact.data.type === 'forecast') {
      const fd = artifact.data as ForecastArtifact;
      if (fd.drivers.length > 1) {
        alternatives.push({
          hypothesis: `${fd.drivers[1]?.domain || 'secondary driver'} is actually the primary driver, not ${fd.drivers[0]?.domain}`,
          whyRankedLower: `Weight analysis ranked it ${((fd.drivers[1]?.weight || 0) * 100).toFixed(0)}% vs ${((fd.drivers[0]?.weight || 0) * 100).toFixed(0)}%`,
          evidenceNeeded: `Run a controlled experiment: change ${fd.drivers[1]?.domain} while holding ${fd.drivers[0]?.domain} constant`,
          probability: Math.min(0.35, (1 - confidence) * 0.5),
        });
      }
      alternatives.push({
        hypothesis: `${domain} trajectory is driven by external factors (market, regulation, competition) not captured in the brain's signals`,
        whyRankedLower: 'Brain only models internal signals — external factors are unobserved',
        evidenceNeeded: 'Compare brain forecast to industry benchmarks and analyst predictions',
        probability: Math.min(0.3, (1 - confidence) * 0.7),
      });
    }

    if (artifact.data.type === 'diagnosis') {
      const dd = artifact.data as DiagnosisArtifact;
      if (dd.anomalyExplanation?.alternativeCauses) {
        for (const alt of dd.anomalyExplanation.alternativeCauses.slice(0, 2)) {
          alternatives.push({
            hypothesis: `${alt.domain} is the true root cause, not ${dd.anomalyExplanation.mostLikelyCause?.domain || domain}`,
            whyRankedLower: `Lower confidence: ${(alt.confidence * 100).toFixed(0)}% vs ${((dd.anomalyExplanation.mostLikelyCause?.confidence || 0) * 100).toFixed(0)}%`,
            evidenceNeeded: `Isolate ${alt.domain} changes and observe ${domain} response`,
            probability: alt.confidence * 0.5,
          });
        }
      }
    }

    if (alternatives.length === 0) {
      alternatives.push({
        hypothesis: 'The brain\'s model is fundamentally missing a critical variable',
        whyRankedLower: 'Cannot detect what it cannot observe',
        evidenceNeeded: 'Compare brain predictions to actual outcomes over 2-3 cycles',
        probability: Math.max(0.1, 1 - confidence),
      });
    }

    return alternatives;
  }

  function buildHighestValueQuestion(artifact: ActionArtifact): string {
    const { domain, metadata } = artifact;

    if (metadata.dagEdgeCount < 5) {
      return `What other business metrics directly influence ${domain}? The brain only has ${metadata.dagEdgeCount} causal edges — training with more cross-domain signals would dramatically improve analysis quality.`;
    }

    if (artifact.data.type === 'forecast') {
      const fd = artifact.data as ForecastArtifact;
      if (fd.drivers.length > 0) {
        return `Is the ${fd.drivers[0].domain}→${domain} relationship truly causal, or is there a confounding variable? A small experiment (vary ${fd.drivers[0].domain} intentionally) would be worth more than 100x more observational data.`;
      }
    }

    if (artifact.data.type === 'diagnosis') {
      const dd = artifact.data as DiagnosisArtifact;
      if (dd.anomalyExplanation?.mostLikelyCause) {
        return `Can you isolate the ${dd.anomalyExplanation.mostLikelyCause.domain} fix and measure ${domain} response in a controlled way? Observational root cause analysis needs experimental validation.`;
      }
    }

    return `What external factors (competition, regulation, market shifts) are affecting ${domain} that the brain's signal network doesn't cover?`;
  }

  // ── V4: Counterfactual Analysis Builder ──────────────────────────────

  function buildCounterfactualAnalysis(
    artifact: ActionArtifact,
    playbook: ExecutionPlaybook | null,
  ): CounterfactualAnalysis {
    const { domain, actionType, confidence, horizonDays } = artifact;

    // ── Baseline scenario ──
    const baseline: CounterfactualScenario = {
      label: 'Brain\'s Primary Recommendation',
      assumption: `Current causal model is correct (${(confidence * 100).toFixed(0)}% confidence)`,
      expectedOutcome: playbook?.executiveSummary || `${actionType} of ${domain} executed as planned`,
      probability: confidence,
      playbookImpact: 'unchanged',
    };

    // ── Build alternative scenarios ──
    const alternatives: CounterfactualScenario[] = [];

    // Scenario: External shock
    alternatives.push({
      label: 'External Disruption',
      assumption: 'A significant external factor (competition, regulation, market shift) overrides internal dynamics',
      expectedOutcome: `${domain} trajectory is primarily driven by external forces, making internal interventions less effective. Brain recommendations still directionally correct but magnitude is uncertain.`,
      probability: Math.min(0.25, (1 - confidence) * 0.4),
      playbookImpact: 'minor_adjustment',
    });

    // Scenario: Brain model is fundamentally wrong
    alternatives.push({
      label: 'Model Mismatch',
      assumption: `The brain's causal model has a critical missing variable that invalidates the ${domain} analysis`,
      expectedOutcome: `Interventions target wrong levers. Need to re-analyze with additional data sources before committing significant resources.`,
      probability: Math.min(0.2, (1 - confidence) * 0.5),
      playbookImpact: confidence < 0.4 ? 'major_revision' : 'minor_adjustment',
    });

    // Scenario: Faster/slower than expected
    if (artifact.data.type === 'forecast' || artifact.data.type === 'simulation') {
      alternatives.push({
        label: 'Velocity Surprise',
        assumption: `Changes happen 2-3× faster (or slower) than the brain predicts — lag times and propagation speeds are miscalibrated`,
        expectedOutcome: `Intervention timing is off. Phase 1 review must specifically validate the speed of change, not just direction.`,
        probability: 0.15,
        playbookImpact: 'minor_adjustment',
      });
    }

    // Action-specific scenarios
    if (artifact.data.type === 'forecast') {
      const fd = artifact.data as ForecastArtifact;
      if (fd.drivers.length > 0) {
        alternatives.push({
          label: 'Driver Decoupling',
          assumption: `${fd.drivers[0].domain} stops influencing ${domain} (relationship breaks down due to regime change)`,
          expectedOutcome: `Forecast trajectory is unreliable. The ${fd.drivers[0].domain}-focused interventions become irrelevant. Need to identify new drivers.`,
          probability: Math.min(0.15, (1 - fd.drivers[0].weight) * 0.3),
          playbookImpact: 'major_revision',
        });
      }
    }

    if (artifact.data.type === 'diagnosis') {
      const dd = artifact.data as DiagnosisArtifact;
      if (dd.anomalyExplanation?.alternativeCauses?.[0]) {
        const alt = dd.anomalyExplanation.alternativeCauses[0];
        alternatives.push({
          label: 'Wrong Root Cause',
          assumption: `${alt.domain} is the real root cause, not ${dd.anomalyExplanation.mostLikelyCause?.domain || 'the identified cause'}`,
          expectedOutcome: `Fixing the identified root cause has no effect. Need to redirect to ${alt.domain} with a ${alt.lagDays || 14}-day response window.`,
          probability: alt.confidence * 0.5,
          playbookImpact: 'major_revision',
        });
      }
    }

    // ── Critical assumption ──
    const criticalAssumption = buildCriticalAssumption(artifact);

    // ── Highest leverage variable ──
    const highestLeverageVariable = buildHighestLeverage(artifact);

    // ── Regret analysis ──
    const regretAnalysis = buildRegretAnalysis(artifact, playbook, alternatives);

    return {
      baseline,
      alternatives,
      criticalAssumption,
      highestLeverageVariable,
      regretAnalysis,
    };
  }

  function buildCriticalAssumption(artifact: ActionArtifact): string {
    if (artifact.data.type === 'forecast') {
      const fd = artifact.data as ForecastArtifact;
      if (fd.drivers.length > 0) {
        return `The ${fd.drivers[0].domain}→${artifact.domain} causal relationship (${(fd.drivers[0].weight * 100).toFixed(0)}% weight) remains stable over the ${artifact.horizonDays}-day horizon. If this link breaks, the entire forecast collapses.`;
      }
      return `Past ${artifact.domain} patterns continue into the future — no regime change or structural break occurs.`;
    }
    if (artifact.data.type === 'simulation') {
      const sd = artifact.data as SimulationArtifact;
      return `The cascade from ${sd.simulation.scenario.sourceDomain} propagates through the causal graph as modeled — no dampening, no amplification, no feedback loops the brain hasn't learned.`;
    }
    if (artifact.data.type === 'diagnosis') {
      return `The identified root cause is correct and addressing it will have the predicted downstream effect on ${artifact.domain}.`;
    }
    return `The brain's causal graph accurately represents the real relationships in the ${artifact.domain} ecosystem.`;
  }

  function buildHighestLeverage(artifact: ActionArtifact): CounterfactualAnalysis['highestLeverageVariable'] {
    if (artifact.data.type === 'forecast') {
      const fd = artifact.data as ForecastArtifact;
      if (fd.drivers.length > 0) {
        const d = fd.drivers[0];
        return {
          variable: `${d.domain} signal strength`,
          domain: d.domain,
          sensitivityPercent: Math.round(d.contribution * 100 * 1.1), // 10% change × contribution
          direction: d.weight > 0 ? 'positive' : 'negative',
        };
      }
    }
    if (artifact.data.type === 'simulation') {
      const sd = artifact.data as SimulationArtifact;
      return {
        variable: `${sd.simulation.scenario.sourceDomain} ${sd.simulation.scenario.direction} magnitude`,
        domain: sd.simulation.scenario.sourceDomain,
        sensitivityPercent: Math.round(Math.abs(sd.simulation.totalImpactPercent) * 0.1),
        direction: sd.simulation.scenario.direction === 'increase' ? 'positive' : 'negative',
      };
    }
    return {
      variable: `${artifact.domain} data quality`,
      domain: artifact.domain,
      sensitivityPercent: Math.round((1 - artifact.confidence) * 50),
      direction: 'positive',
    };
  }

  function buildRegretAnalysis(
    artifact: ActionArtifact,
    playbook: ExecutionPlaybook | null,
    alternatives: CounterfactualScenario[],
  ): CounterfactualAnalysis['regretAnalysis'] {
    const confidence = artifact.confidence;
    const hasHighImpactAlternative = alternatives.some(a => a.playbookImpact === 'major_revision' && a.probability > 0.15);

    const bestCase = playbook && playbook.interventions.length > 0
      ? `Interventions succeed: ${playbook.interventions[0].expectedImpact}. Confidence improves as predictions validate.`
      : `Analysis informs good decisions. Brain learns from outcomes and improves.`;

    const worstCase = hasHighImpactAlternative
      ? `${alternatives.find(a => a.playbookImpact === 'major_revision')?.label}: ${alternatives.find(a => a.playbookImpact === 'major_revision')?.expectedOutcome}`
      : `Recommendations are directionally off — resources are misallocated for ${Math.ceil(artifact.horizonDays / 4)} days before correction.`;

    const inactionCost = playbook && playbook.interventions.length > 0
      ? `Missed window: the brain identified ${playbook.interventions.length} time-sensitive interventions. Delay of ${playbook.interventions[0]?.timeToImpactDays || 14} days could reduce effectiveness.`
      : `Low: the analysis is informational, not time-critical. Gathering more data before acting is reasonable.`;

    let recommendation: CounterfactualAnalysis['regretAnalysis']['recommendation'];
    if (confidence >= 0.6 && !hasHighImpactAlternative) {
      recommendation = 'proceed';
    } else if (confidence >= 0.35) {
      recommendation = 'proceed_with_caution';
    } else if (confidence >= 0.15) {
      recommendation = 'gather_more_data';
    } else {
      recommendation = 'reconsider';
    }

    return { bestCase, worstCase, inactionCost, recommendation };
  }

  // ── V4: Adaptive Layer Builder ─────────────────────────────────────

  function buildAdaptiveLayer(
    artifact: ActionArtifact,
    playbook: ExecutionPlaybook | null,
  ): AdaptiveLayer {
    const { domain, actionType, confidence } = artifact;

    // ── Contingency triggers ──
    const contingencyTriggers: ContingencyTrigger[] = [];

    // Phase 1 contingencies (what if validation fails?)
    contingencyTriggers.push({
      trigger: `Phase 1 review reveals the team disputes the brain's top causal driver for ${domain}`,
      phase: 1,
      action: `Run an "explain" action targeting the disputed connection. Also run a broader composite model.`,
      playbookRevision: 'Replace Phase 2 interventions with newly identified drivers from the explain analysis.',
    });

    if (actionType === 'forecast') {
      const fd = artifact.data as ForecastArtifact;
      if (fd.drivers.length > 0) {
        contingencyTriggers.push({
          trigger: `${fd.drivers[0].domain} metric moves in the opposite direction from what the brain assumed`,
          phase: 2,
          action: `Pause ${fd.drivers[0].domain}-related interventions. Re-run forecast with updated data.`,
          playbookRevision: `Shift focus to the next strongest driver (${fd.drivers[1]?.domain || 'alternative lever'}) while re-analyzing.`,
        });
      }
    }

    if (actionType === 'simulate') {
      contingencyTriggers.push({
        trigger: 'Cascade propagation is faster than predicted (impact seen 2× earlier)',
        phase: 2,
        action: 'Accelerate all Phase 2 interventions. Move Phase 3 monitoring to run concurrently.',
        playbookRevision: 'Compress timeline. What was a 28-day execution becomes 14-day sprint.',
      });
    }

    if (actionType === 'diagnose') {
      contingencyTriggers.push({
        trigger: `Fixing the identified root cause shows no improvement in ${domain} within expected lag time`,
        phase: 2,
        action: 'Investigate alternative causes. Run a fresh diagnosis with the failed fix as new evidence.',
        playbookRevision: 'Abandon current root cause hypothesis. Pivot to the next-ranked alternative cause.',
      });
    }

    // Low confidence trigger
    if (confidence < 0.5) {
      contingencyTriggers.push({
        trigger: `Re-analysis after Phase 1 data collection still shows <50% confidence for ${domain}`,
        phase: 1,
        action: `Escalate to manual expert analysis. The brain needs more signal data before its recommendations are reliable.`,
        playbookRevision: 'Pause automated playbook. Switch to expert-driven approach supplemented by brain data.',
      });
    }

    // ── Re-analysis signals ──
    const reanalysisSignals: string[] = [
      `Any ${domain} metric moves >2 standard deviations from the brain's prediction`,
      'A new data source is connected that covers a previously blind domain',
      `Confidence drops below ${(confidenceThreshold * 100).toFixed(0)}% on re-evaluation`,
      'An external event (market, regulatory, competitive) invalidates core assumptions',
      `More than 50% of Phase 1 milestones are disputed by domain experts`,
    ];

    // ── Learning agenda ──
    const learningAgenda: LearningQuestion[] = [];

    learningAgenda.push({
      question: `Is the brain's confidence calibrated? Does ${(confidence * 100).toFixed(0)}% confidence mean the brain is right ~${(confidence * 100).toFixed(0)}% of the time?`,
      phase: 3,
      measurement: 'Compare brain predictions to actual outcomes across last 10 analyses',
      currentAssumption: `Brain confidence is reasonably calibrated (but untested for ${domain})`,
    });

    if (artifact.data.type === 'forecast') {
      const fd = artifact.data as ForecastArtifact;
      if (fd.drivers.length > 0) {
        learningAgenda.push({
          question: `Does changing ${fd.drivers[0].domain} actually cause ${domain} to move? (causal vs correlational)`,
          phase: 2,
          measurement: `Track ${domain} response after ${fd.drivers[0].domain} interventions with ${fd.drivers[0].lagDays}-day delay`,
          currentAssumption: `${fd.drivers[0].domain} causally drives ${domain} with ${(fd.drivers[0].weight * 100).toFixed(0)}% weight`,
        });
      }
    }

    learningAgenda.push({
      question: `What domains affect ${domain} that the brain hasn't discovered yet?`,
      phase: 1,
      measurement: 'Ask domain experts: what factors do you believe drive this metric?',
      currentAssumption: `The brain's ${artifact.metadata.dagEdgeCount}-edge causal graph captures the key relationships`,
    });

    // ── Decision gates ──
    const decisionGates: DecisionGate[] = [
      {
        name: 'Validation Gate',
        betweenPhases: [1, 2],
        proceedCriteria: [
          'Domain experts confirm (or don\'t dispute) the top 2 brain findings',
          `Re-run confidence is still ≥${(confidenceThreshold * 100).toFixed(0)}%`,
          'No critical contingency triggers fired during Phase 1',
        ],
        fallbackAction: 'Re-run the brain analysis with Phase 1 learnings as new evidence. Generate revised playbook before proceeding.',
      },
      {
        name: 'Effectiveness Gate',
        betweenPhases: [2, 3],
        proceedCriteria: [
          'At least 1 intervention shows measurable directional impact',
          'No catastrophic unexpected outcomes from Phase 2 actions',
          'Team confidence in the approach is ≥ "cautiously optimistic"',
        ],
        fallbackAction: 'Pause Phase 3. Conduct retrospective. Either revise interventions or switch to alternative hypothesis.',
      },
    ];

    return { contingencyTriggers, reanalysisSignals, learningAgenda, decisionGates };
  }

  // ── V4: Decision Journal Entry Builder ─────────────────────────────

  function buildDecisionJournalEntry(
    question: string,
    artifact: ActionArtifact,
    playbook: ExecutionPlaybook | null,
    metaCognition: MetaCognitiveAssessment | null,
  ): DecisionJournalEntry {
    const { domain, actionType, confidence, metadata } = artifact;

    return {
      timestamp: new Date().toISOString(),
      question,
      recommendation: playbook?.executiveSummary || artifact.narrative.slice(0, 200),
      mondayMorningAction: playbook?.mondayMorningAction || 'Review the analysis with your team.',
      assumptions: metaCognition?.confidenceAnchors || ['Brain data is sufficient for this domain'],
      predictedOutcome: playbook?.interventions[0]?.expectedImpact || `${actionType} analysis informs decision-making for ${domain}`,
      reviewDate: new Date(Date.now() + artifact.horizonDays * 24 * 60 * 60 * 1000 * 0.5).toISOString().split('T')[0],
      confidenceAtDecision: confidence,
      falsificationCriteria: metaCognition?.falsificationCriteria || [`Confidence drops below ${(confidenceThreshold * 100).toFixed(0)}%`],
      domain,
      actionType,
      confidenceBreakdown: {
        dataQuality: Math.min(1, metadata.timeSeriesDomainsLoaded / 10),
        modelFit: confidence,
        domainCoverage: Math.min(1, metadata.dagNodeCount / 20),
        overall: confidence,
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

      // V3: Build Outcome Contract
      const outcomeContract = buildOutcomeContract(question, artifact);

      // V3: Generate Execution Playbook (template first, LLM upgrade if available)
      let playbook: ExecutionPlaybook | null = null;
      if (!artifact.confidenceGated) {
        const templatePlaybook = buildTemplatePlaybook(artifact, question);
        playbook = await upgradePlaybookWithLLM(templatePlaybook, artifact, question);
      }

      // V4: Build Meta-Cognitive Assessment
      const executionTimings: Array<{ step: string; module: string; input: string; output: string; durationMs: number }> = [
        {
          step: `Route intent "${knowledge.intent}" to action "${actionType}"`,
          module: 'smart-router',
          input: `question="${question}", intent="${knowledge.intent}"`,
          output: `actionType="${actionType}", domain="${domain}"`,
          durationMs: 1,
        },
        {
          step: `Execute ${actionType} for ${domain}`,
          module: `${actionType}-executor`,
          input: `domain="${domain}", horizon=${horizonDays}d`,
          output: `confidence=${(artifact.confidence * 100).toFixed(0)}%, modules=${artifact.metadata.modulesUsed.join(',')}`,
          durationMs: artifact.durationMs,
        },
      ];
      if (artifact.metadata.llmNarrativeUsed) {
        executionTimings.push({
          step: 'LLM narrative enrichment',
          module: 'brain-amplifier',
          input: 'template narrative + artifact data',
          output: 'enriched narrative',
          durationMs: Date.now() - executeStart - artifact.durationMs,
        });
      }

      const metaCognition = buildMetaCognitiveAssessment(
        { ...artifact, playbook: playbook, outcomeContract },
        executionTimings,
      );

      // V4: Build Counterfactual Analysis
      const counterfactuals = buildCounterfactualAnalysis(
        { ...artifact, playbook, outcomeContract, metaCognition: null, counterfactuals: null, adaptiveLayer: null, decisionJournal: null },
        playbook,
      );

      // V4: Build Adaptive Layer
      const adaptiveLayer = buildAdaptiveLayer(
        { ...artifact, playbook, outcomeContract, metaCognition: null, counterfactuals: null, adaptiveLayer: null, decisionJournal: null },
        playbook,
      );

      // V4: LLM Decision Intelligence upgrade (enriches meta-cognition + counterfactuals)
      if (amplifier && !artifact.confidenceGated && playbook) {
        try {
          const formattedData = formatArtifactForPrompt({
            ...artifact, playbook, outcomeContract,
            metaCognition: null, counterfactuals: null, adaptiveLayer: null, decisionJournal: null,
          });
          const llmDecisionIntel = await amplifier.generateDecisionIntelligence({
            actionType: artifact.actionType,
            domain: artifact.domain,
            question,
            confidence: artifact.confidence,
            horizonDays: artifact.horizonDays,
            narrative: artifact.narrative,
            mondayMorningAction: playbook.mondayMorningAction,
            executiveSummary: playbook.executiveSummary,
            formattedData,
            templateMetaCognition: {
              confidenceAnchors: metaCognition.confidenceAnchors,
              blindSpots: metaCognition.blindSpots,
              devilsAdvocate: metaCognition.devilsAdvocate,
            },
          });

          // Merge LLM intelligence into template outputs
          if (llmDecisionIntel.devilsAdvocate) {
            metaCognition.devilsAdvocate = llmDecisionIntel.devilsAdvocate;
          }
          if (llmDecisionIntel.blindSpots.length > 0) {
            metaCognition.blindSpots = llmDecisionIntel.blindSpots;
          }
          if (llmDecisionIntel.alternativeHypotheses.length > 0) {
            metaCognition.alternativeHypotheses = llmDecisionIntel.alternativeHypotheses;
          }
          if (llmDecisionIntel.highestValueQuestion) {
            metaCognition.highestValueQuestion = llmDecisionIntel.highestValueQuestion;
          }
          if (llmDecisionIntel.counterfactualScenarios.length > 0) {
            counterfactuals.alternatives = llmDecisionIntel.counterfactualScenarios;
          }
          if (llmDecisionIntel.criticalAssumption) {
            counterfactuals.criticalAssumption = llmDecisionIntel.criticalAssumption;
          }
          if (llmDecisionIntel.regretRecommendation) {
            counterfactuals.regretAnalysis.recommendation = llmDecisionIntel.regretRecommendation;
          }
        } catch (err) {
          log('V4 LLM decision intelligence upgrade failed (using templates):', err);
        }
      }

      // V4: Build Decision Journal Entry
      const decisionJournal = buildDecisionJournalEntry(question, artifact, playbook, metaCognition);

      // V3 + V4: Attach everything to artifact
      artifact = {
        ...artifact,
        playbook,
        outcomeContract,
        metaCognition,
        counterfactuals,
        adaptiveLayer,
        decisionJournal,
      };

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
        playbook: null,
        outcomeContract: {
          question,
          deliveredOutcome: `${actionType} execution failed — see error details`,
          deliverableType: 'forecast_model',
          fulfillment: 'insufficient_data',
          gaps: ['Execution failed due to internal error'],
          dataNeeded: ['Verify data sources and retry'],
          modulesUsed: [],
          computedFromRealData: false,
        },
        metaCognition: null,
        counterfactuals: null,
        adaptiveLayer: null,
        decisionJournal: null,
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

  // V3: Include execution playbook in prompt
  if (artifact.playbook) {
    formatPlaybookForPrompt(artifact.playbook, parts);
  }

  // V3: Include outcome contract in prompt
  if (artifact.outcomeContract) {
    parts.push('');
    parts.push(`## Outcome Contract`);
    parts.push(`Fulfillment: ${artifact.outcomeContract.fulfillment} | Deliverable: ${artifact.outcomeContract.deliverableType}`);
    parts.push(`Delivered: ${artifact.outcomeContract.deliveredOutcome}`);
    if (artifact.outcomeContract.gaps && artifact.outcomeContract.gaps.length > 0) {
      parts.push(`Gaps: ${artifact.outcomeContract.gaps.join('; ')}`);
    }
    if (artifact.outcomeContract.dataNeeded && artifact.outcomeContract.dataNeeded.length > 0) {
      parts.push(`Data needed: ${artifact.outcomeContract.dataNeeded.join('; ')}`);
    }
  }

  // V4: Include meta-cognitive assessment in prompt
  if (artifact.metaCognition) {
    formatMetaCognitionForPrompt(artifact.metaCognition, parts);
  }

  // V4: Include counterfactual analysis in prompt
  if (artifact.counterfactuals) {
    formatCounterfactualsForPrompt(artifact.counterfactuals, parts);
  }

  // V4: Include adaptive layer in prompt
  if (artifact.adaptiveLayer) {
    formatAdaptiveLayerForPrompt(artifact.adaptiveLayer, parts);
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

// ── V3: Playbook Prompt Formatting ──────────────────────────────────────

function formatPlaybookForPrompt(playbook: ExecutionPlaybook, parts: string[]): void {
  parts.push('');
  parts.push(`## EXECUTION PLAYBOOK ${playbook.isLLMGenerated ? '(AI-Enhanced)' : '(Template)'}`);
  parts.push(`Confidence: ${(playbook.confidence * 100).toFixed(0)}%`);
  parts.push('');
  parts.push(`### 🎯 Monday Morning Action`);
  parts.push(playbook.mondayMorningAction);
  parts.push('');
  parts.push(`### Executive Summary`);
  parts.push(playbook.executiveSummary);

  if (playbook.interventions.length > 0) {
    parts.push('');
    parts.push(`### Strategic Interventions (${playbook.interventions.length})`);
    for (const iv of playbook.interventions.slice(0, 5)) {
      parts.push(`  - [${iv.owner}] ${iv.action}`);
      parts.push(`    Impact: ${iv.expectedImpact} | Time: ${iv.timeToImpactDays}d | Effort: ${iv.effort} | Confidence: ${(iv.confidence * 100).toFixed(0)}%`);
      parts.push(`    Evidence: ${iv.evidence}`);
    }
  }

  if (playbook.phases.length > 0) {
    parts.push('');
    parts.push(`### Execution Phases`);
    for (const phase of playbook.phases) {
      parts.push(`  Phase ${phase.phase}: ${phase.name} (${phase.timeframe})`);
      for (const act of phase.activities) {
        parts.push(`    - ${act}`);
      }
      for (const ms of phase.milestones) {
        parts.push(`    ✓ Milestone: ${ms.milestone} — ${ms.criteria} [${ms.owner}]`);
      }
    }
  }

  if (playbook.successMetrics.length > 0) {
    parts.push('');
    parts.push(`### Success Metrics`);
    for (const kpi of playbook.successMetrics) {
      parts.push(`  - ${kpi.metric}: ${kpi.currentValue} → ${kpi.targetValue} (by ${kpi.measureBy})`);
    }
  }

  if (playbook.risks.length > 0) {
    parts.push('');
    parts.push(`### Risks`);
    for (const risk of playbook.risks) {
      parts.push(`  - [${risk.severity.toUpperCase()}] ${risk.risk}`);
      parts.push(`    Mitigation: ${risk.mitigation}`);
    }
  }
}

// ── V4: Meta-Cognition Prompt Formatting ────────────────────────────────

function formatMetaCognitionForPrompt(mc: MetaCognitiveAssessment, parts: string[]): void {
  parts.push('');
  parts.push(`## 🧠 META-COGNITION (Brain Self-Assessment)`);
  parts.push(`Domain Mastery: ${(mc.domainMastery * 100).toFixed(0)}% | Strategy: ${mc.reasoningStrategy}`);
  parts.push('');

  parts.push(`### Devil's Advocate`);
  parts.push(mc.devilsAdvocate);

  if (mc.blindSpots.length > 0) {
    parts.push('');
    parts.push(`### Blind Spots`);
    for (const bs of mc.blindSpots) {
      parts.push(`  ⚠️ ${bs}`);
    }
  }

  if (mc.falsificationCriteria.length > 0) {
    parts.push('');
    parts.push(`### What Would Prove This Wrong`);
    for (const fc of mc.falsificationCriteria) {
      parts.push(`  ❌ ${fc}`);
    }
  }

  if (mc.alternativeHypotheses.length > 0) {
    parts.push('');
    parts.push(`### Alternative Hypotheses`);
    for (const ah of mc.alternativeHypotheses) {
      parts.push(`  - [${(ah.probability * 100).toFixed(0)}%] ${ah.hypothesis}`);
      parts.push(`    Evidence needed: ${ah.evidenceNeeded}`);
    }
  }

  parts.push('');
  parts.push(`### Highest Value Question`);
  parts.push(`  💎 ${mc.highestValueQuestion}`);
}

function formatCounterfactualsForPrompt(cf: CounterfactualAnalysis, parts: string[]): void {
  parts.push('');
  parts.push(`## 🔮 COUNTERFACTUAL ANALYSIS`);
  parts.push(`Critical Assumption: ${cf.criticalAssumption}`);
  parts.push('');

  parts.push(`### Scenarios`);
  parts.push(`  📊 Baseline: ${cf.baseline.label} (${(cf.baseline.probability * 100).toFixed(0)}% likely)`);
  for (const alt of cf.alternatives.slice(0, 4)) {
    const impactEmoji = alt.playbookImpact === 'unchanged' ? '✅' : alt.playbookImpact === 'minor_adjustment' ? '🟡' : alt.playbookImpact === 'major_revision' ? '🟠' : '🔴';
    parts.push(`  ${impactEmoji} ${alt.label} (${(alt.probability * 100).toFixed(0)}%): ${alt.assumption}`);
    parts.push(`     Impact: ${alt.playbookImpact.replace(/_/g, ' ')} — ${alt.expectedOutcome.slice(0, 120)}`);
  }

  parts.push('');
  parts.push(`### Highest Leverage Variable`);
  parts.push(`  📈 ${cf.highestLeverageVariable.variable}: ±10% change → ${cf.highestLeverageVariable.sensitivityPercent}% outcome impact (${cf.highestLeverageVariable.direction})`);

  parts.push('');
  parts.push(`### Regret Analysis`);
  parts.push(`  Best case: ${cf.regretAnalysis.bestCase}`);
  parts.push(`  Worst case: ${cf.regretAnalysis.worstCase}`);
  parts.push(`  Cost of inaction: ${cf.regretAnalysis.inactionCost}`);
  parts.push(`  🎯 Recommendation: **${cf.regretAnalysis.recommendation.replace(/_/g, ' ').toUpperCase()}**`);
}

function formatAdaptiveLayerForPrompt(al: AdaptiveLayer, parts: string[]): void {
  parts.push('');
  parts.push(`## 🔄 ADAPTIVE PLAYBOOK`);

  if (al.contingencyTriggers.length > 0) {
    parts.push('');
    parts.push(`### Contingency Triggers (If-Then Plans)`);
    for (const ct of al.contingencyTriggers.slice(0, 4)) {
      parts.push(`  Phase ${ct.phase}: IF ${ct.trigger}`);
      parts.push(`    THEN: ${ct.action}`);
    }
  }

  if (al.decisionGates.length > 0) {
    parts.push('');
    parts.push(`### Decision Gates (Go/No-Go)`);
    for (const dg of al.decisionGates) {
      parts.push(`  ${dg.name} (Phase ${dg.betweenPhases[0]}→${dg.betweenPhases[1]})`);
      parts.push(`    Proceed if: ${dg.proceedCriteria.join(' AND ')}`);
      parts.push(`    Fallback: ${dg.fallbackAction}`);
    }
  }

  if (al.learningAgenda.length > 0) {
    parts.push('');
    parts.push(`### Learning Agenda`);
    for (const lq of al.learningAgenda.slice(0, 3)) {
      parts.push(`  Phase ${lq.phase}: ${lq.question}`);
      parts.push(`    Current assumption: ${lq.currentAssumption}`);
    }
  }
}
