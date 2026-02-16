/**
 * Action Domain Registry V1 — Self-Registering, Composable Brain Functions
 * =========================================================================
 *
 * Brain Analog: Prefrontal Cortex (executive function — decides WHAT to do)
 *              + Brodmann Areas (specialized processing regions)
 *
 * THIS IS THE REPLACEMENT FOR THE 3,366-LINE MONOLITH.
 *
 * Instead of 5 hardcoded action types with 27 switch cases, every action
 * is a self-describing, self-registering brain function. Adding a new
 * action domain is 10-15 lines of code — no core engine changes needed.
 *
 * Architecture:
 *   1. defineActionDomain() — factory that creates action domain definitions
 *   2. createActionDomainRegistry() — registry that holds all domains
 *   3. SemanticRouter — routes questions to the right domain(s)
 *   4. CompositionEngine — chains domains into multi-step pipelines
 *   5. Brain integration — every domain gets full brain context
 *
 * The key insight: Action domains are NOT procedures. They are
 * BRAIN FUNCTIONS — they receive perception (data), use cognition
 * (reasoning), and produce action (artifacts + motor commands).
 * Each one is a specialized neural pathway.
 *
 * Design: Factory + Registry pattern matching agent-registry.ts.
 *         Never throws. Graceful degradation. Full audit trail.
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES — Action Domain Definition
// ============================================================================

/** What brain capabilities an action domain can request */
export type BrainCapability =
  | 'causalDAG'
  | 'timeSeries'
  | 'temporalForecaster'
  | 'whatIfSimulator'
  | 'contextAwareReasoner'
  | 'explanationGenerator'
  | 'rules'
  | 'patterns'
  | 'cascades'
  | 'anomalyDetector'
  | 'llmAmplifier'
  | 'motorCommands'
  | 'calibrationLoop'
  | 'agentRegistry'
  | 'signalCollector'
  | 'attentionManager';

/** Semantic intent categories that domains can handle */
export type SemanticIntent =
  | 'predict'
  | 'simulate'
  | 'explain'
  | 'diagnose'
  | 'compare'
  | 'monitor'
  | 'optimize'
  | 'recommend'
  | 'audit'
  | 'correlate'
  | 'benchmark'
  | 'narrate'
  | 'build'
  | 'general'
  // V6.1 — Advanced Brain Cognition
  | 'sentiment'
  | 'scenario-tree'
  | 'risk-cascade'
  | 'resource-allocate'
  | 'anomaly-predict'
  | 'goal-decompose'
  | 'causal-intervene'
  | 'pattern-memory'
  // V7 — Accounting Intelligence (Multi-Jurisdiction)
  | 'document-comprehend'
  | 'completeness-check'
  | 'rule-apply'
  | 'cross-validate'
  | 'statement-synthesize'
  | 'jurisdiction-comply'
  | 'confidence-triage'
  // V8 — Software Engineering as a Service
  | 'codebase-comprehend'
  | 'spec-completeness'
  | 'requirement-clarify'
  | 'pattern-enforce'
  | 'consistency-verify'
  | 'code-generate'
  | 'review-triage'
  | 'interrogate' // Added for requirement-clarify (reuses Broca's questioning)
  // V8 — Metacognition + Self-Improvement
  | 'calibration-audit'    // Brain self-accuracy assessment
  | 'error-attribute'      // Why-was-I-wrong diagnosis
  | 'chain-validate'       // Composed result consistency check
  | 'uncertainty-quantify' // Epistemic vs aleatoric decomposition
  | 'query-cache'          // Working memory buffer stats
  | 'execution-profile'    // Performance self-observation
  | 'robustness-check'    // Perturbation sensitivity analysis
  // V9 — P1 Gap Closure (SE-aaS expansion)
  | 'dependency-upgrade'   // Outdated dependency + security analysis
  | 'design-doc-generate'  // HLD/LLD document generation
  | 'performance-profile'  // APM bottleneck + SLA risk analysis
  | 'dead-code-detect';    // Unused import/function detection

/** Output schema declaration — what a domain produces */
export interface DomainOutputSchema {
  /** Machine-readable data type */
  dataType: string;
  /** What fields the output contains */
  fields: string[];
  /** Whether this output can feed into other domains */
  composable: boolean;
  /** What other domains can consume this output */
  consumableBy?: string[];
}

/** The brain context every action domain receives */
export interface ActionDomainBrainContext {
  /** The CausalDAG — the brain's world model */
  dag: {
    nodes: Set<string>;
    edges: Map<string, Map<string, {
      weight: number;
      pValue: number;
      lagDays: number;
      sampleSize: number;
      knockoutScore?: number;
      coefficientSign?: number;
      predictionAccuracy?: number;
    }>>;
  };
  /** Time series data per domain */
  timeSeries: Map<string, {
    dates: string[];
    values: number[];
    domain: string;
  }>;
  /** Domain-specific causal causes */
  directCauses: Record<string, Array<{ source: string; target: string; weight: number; lagDays: number }>>;
  /** Domain-specific causal effects */
  directEffects: Record<string, Array<{ source: string; target: string; weight: number; lagDays: number }>>;
  /** Matched business rules */
  matchedRules: Array<{ title: string; naturalLanguage: string; conditions: string[]; triggered: boolean }>;
  /** Discovered patterns */
  patterns: Array<{ domain: string; pattern: string; significance: number }>;
  /** Cascade paths between domains */
  cascadePaths: Array<{ source: string; target: string; hops: number; totalLag: number }>;
  /** The primary domain being queried */
  primaryDomain: string;
  /** All extracted domains */
  extractedDomains: string[];
  /** The original question */
  question: string;
  /** Detected user intent */
  intent: string;
  /** Forecast horizon in days */
  horizonDays: number;
  /** Source of horizon detection */
  horizonSource: 'parsed' | 'default' | 'override';
}

/** Brain modules that action domains can call */
export interface ActionDomainBrainModules {
  /** Temporal forecaster — predict future values */
  forecaster: {
    forecast: (timeSeries: Map<string, unknown>, dag: unknown, domain: string, horizonDays: number) => unknown;
  } | null;
  /** What-if simulator — counterfactual scenarios */
  simulator: {
    simulate: (scenario: unknown) => unknown;
  } | null;
  /** Context-aware reasoner — multi-hop causal analysis */
  reasoner: {
    analyzeConnection: (dag: unknown, source: string, target: string) => unknown;
    explainAnomaly: (anomaly: unknown, dag: unknown, timeSeries: unknown) => unknown;
    whatIf: (dag: unknown, intervention: unknown) => unknown;
  } | null;
  /** Explanation generator — natural language reasoning chains */
  explainer: {
    explainPrediction: (dag: unknown, connection: unknown, label: string) => unknown;
  } | null;
  /** LLM brain amplifier — Claude as judgment layer */
  amplifier: {
    amplifyInsight: (insight: unknown) => Promise<string>;
    generateExecutionPlaybook: (artifact: unknown) => Promise<unknown>;
    generateDecisionIntelligence: (artifact: unknown) => Promise<unknown>;
  } | null;
  /** Motor command engine — execute actions */
  motorCommandEngine: {
    playbookToCommands: (playbook: unknown, sourceType: string) => unknown[];
    interventionToCommand: (intervention: unknown, sourceType: string) => unknown;
    executeBatch: (commands: unknown[]) => Promise<unknown>;
  } | null;
  /** Calibration loop — prediction tracking */
  calibrationLoop: {
    recalibrateConfidence: (confidence: number, domain: string, actionType: string) => {
      calibratedConfidence: number;
      adjustmentApplied: boolean;
      adjustmentFactor: number;
      reason: string;
    };
    recordPrediction: (entry: unknown) => { id: string };
  } | null;
  /** Agent registry — composable agents */
  agentRegistry: {
    runAgent: (name: string, input: unknown, options?: unknown) => Promise<unknown>;
    hasAgent: (name: string) => boolean;
  } | null;
}

/** Full execution context passed to every action domain */
export interface ActionDomainExecutionContext {
  /** Brain context — the world model */
  brain: ActionDomainBrainContext;
  /** Brain modules — the computational tools */
  modules: ActionDomainBrainModules;
  /** Call another action domain from within this one */
  callDomain: (domainName: string, overrides?: Partial<ActionDomainBrainContext>) => Promise<ActionDomainResult>;
  /** Log a message (respects verbose setting) */
  log: (...args: unknown[]) => void;
  /** Report progress (0-1) */
  reportProgress: (progress: number, message: string) => void;
  /** Current execution depth (for composition protection) */
  depth: number;
  /** Unique execution ID */
  executionId: string;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/** Result from executing an action domain */
export interface ActionDomainResult {
  /** Machine-readable structured data */
  data: Record<string, unknown>;
  /** Natural language narrative */
  narrative: string;
  /** 0-1 confidence in results */
  confidence: number;
  /** Causal drivers identified */
  drivers: Array<{ domain: string; weight: number; lagDays: number; direction: 'positive' | 'negative' }>;
  /** Suggested interventions */
  interventions: Array<{
    action: string;
    targetDomains: string[];
    expectedImpact: string;
    confidence: number;
    evidence: string;
    owner: string;
    effort: 'low' | 'medium' | 'high';
  }>;
  /** What modules were used */
  modulesUsed: string[];
  /** Execution metadata */
  metadata: Record<string, unknown>;
}

/** The definition of an action domain — what you pass to defineActionDomain() */
export interface ActionDomainDefinition {
  /** Unique name (kebab-case) */
  name: string;
  /** Human-readable description (1-2 sentences) */
  description: string;
  /** Brain analog — what part of the brain this maps to */
  brainAnalog: string;
  /** Version */
  version?: string;
  /** What brain capabilities this domain REQUIRES */
  requires: BrainCapability[];
  /** What brain capabilities are OPTIONAL (enhance if available) */
  optional?: BrainCapability[];
  /** What semantic intents this domain handles */
  intents: SemanticIntent[];
  /** Intent match keywords — for fast routing before semantic matching */
  intentKeywords: string[];
  /** Regex patterns that strongly indicate this domain (fast path) */
  intentPatterns?: RegExp[];
  /** What business domains this is relevant to (empty = all) */
  relevantDomains?: string[];
  /** Priority when multiple domains match (higher = preferred) */
  priority?: number;
  /** Output schema — what this domain produces */
  outputSchema: DomainOutputSchema;
  /** What other domains this can compose with */
  composableWith?: string[];
  /** What domains must run BEFORE this one in a composition */
  dependsOn?: string[];
  /** Tags for filtering */
  tags?: string[];
  /** The execution function — the brain function itself */
  execute: (ctx: ActionDomainExecutionContext) => Promise<ActionDomainResult>;
  /** Format the result for LLM prompt injection */
  formatForPrompt: (result: ActionDomainResult, ctx: ActionDomainBrainContext) => string;
  /** Build the devil's advocate argument for this domain's output */
  buildDevilsAdvocate?: (result: ActionDomainResult, ctx: ActionDomainBrainContext) => string;
  /** Build domain-specific Monday morning action */
  buildMondayAction?: (result: ActionDomainResult, ctx: ActionDomainBrainContext) => string;
  /** Build domain-specific failsafe data when execution fails */
  buildFailsafe?: (ctx: ActionDomainBrainContext) => Record<string, unknown>;
}

/** Internal registered domain with runtime metadata */
export interface RegisteredActionDomain {
  definition: ActionDomainDefinition;
  registeredAt: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgDurationMs: number;
  avgConfidence: number;
  enabled: boolean;
  /** Per-domain performance tracking */
  domainPerformance: Map<string, { executions: number; avgConfidence: number; avgDurationMs: number }>;
}

// ============================================================================
// TYPES — Semantic Router
// ============================================================================

/** Route resolution — which domain(s) should handle this question */
export interface RouteResolution {
  /** Primary domain to execute */
  primary: string;
  /** Additional domains to compose (in order) */
  composition: string[];
  /** How confident the router is in this resolution */
  confidence: number;
  /** Reasoning for this route */
  reasoning: string;
  /** Whether this is a composite (multi-domain) execution */
  isComposite: boolean;
  /** Detected intents */
  detectedIntents: SemanticIntent[];
}

// ============================================================================
// TYPES — Composition Engine
// ============================================================================

/** A step in a composition pipeline */
export interface CompositionStep {
  /** Domain name to execute */
  domainName: string;
  /** Step order (0-based) */
  order: number;
  /** What data flows from previous steps */
  inputFromSteps: number[];
  /** Whether this step can run in parallel with others */
  parallel: boolean;
}

/** A composition plan — how to chain domains */
export interface CompositionPlan {
  /** All steps to execute */
  steps: CompositionStep[];
  /** Total estimated duration */
  estimatedDurationMs: number;
  /** Why this composition was chosen */
  reasoning: string;
}

// ============================================================================
// TYPES — Execution History
// ============================================================================

/** Full record of a domain execution */
export interface DomainExecutionRecord {
  executionId: string;
  domainName: string;
  question: string;
  primaryDomain: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  confidence: number;
  result: ActionDomainResult | null;
  error: string | null;
  compositionPlan: CompositionPlan | null;
  depth: number;
}

// ============================================================================
// TYPES — Registry Config
// ============================================================================

/** Configuration for the action domain registry */
export interface ActionDomainRegistryConfig {
  /** Max composition depth (prevent infinite loops) */
  maxCompositionDepth?: number;
  /** Default timeout per domain execution (ms) */
  defaultTimeoutMs?: number;
  /** Whether to log execution details */
  verbose?: boolean;
  /** Callback when a domain completes */
  onDomainCompleted?: (record: DomainExecutionRecord) => void;
  /** Callback when a domain fails */
  onDomainFailed?: (record: DomainExecutionRecord) => void;
  /** Callback for progress updates */
  onProgress?: (domainName: string, progress: number, message: string) => void;
}

// ============================================================================
// defineActionDomain() — Factory
// ============================================================================

/**
 * Create an action domain definition with sensible defaults.
 *
 * This is the primary API for creating new brain functions.
 * Every action domain is a specialized neural pathway.
 *
 * @example
 * ```typescript
 * const forecastDomain = defineActionDomain({
 *   name: 'forecast',
 *   description: 'Temporal prediction using causal graph + time series',
 *   brainAnalog: 'Temporal Cortex — predicts future states',
 *   requires: ['causalDAG', 'timeSeries', 'temporalForecaster'],
 *   intents: ['predict'],
 *   intentKeywords: ['forecast', 'predict', 'projection', 'estimate'],
 *   outputSchema: { dataType: 'forecast', fields: ['predictions', 'intervals', 'drivers'], composable: true },
 *   execute: async (ctx) => { ... },
 *   formatForPrompt: (result, ctx) => `## Forecast: ${ctx.primaryDomain} ...`,
 * });
 * ```
 */
export function defineActionDomain(
  definition: ActionDomainDefinition,
): ActionDomainDefinition {
  return {
    version: '1.0.0',
    optional: [],
    intentPatterns: [],
    relevantDomains: [],
    priority: 50,
    composableWith: [],
    dependsOn: [],
    tags: [],
    buildDevilsAdvocate: (result, ctx) => {
      return `This ${definition.name} analysis at ${(result.confidence * 100).toFixed(0)}% confidence could be wrong if the causal model misses key external factors or if the ${ctx.primaryDomain} domain has structural breaks not captured in historical data.`;
    },
    buildMondayAction: (result, ctx) => {
      if (result.interventions.length > 0) {
        const top = result.interventions[0];
        return `${top.action} — targeting ${top.targetDomains.join(', ')} with expected impact: ${top.expectedImpact}`;
      }
      return `Review the ${definition.name} analysis for ${ctx.primaryDomain} and identify the highest-leverage action.`;
    },
    buildFailsafe: (ctx) => ({
      type: definition.name,
      domain: ctx.primaryDomain,
      error: 'Execution failed — insufficient data or module unavailable',
    }),
    ...definition,
  };
}

// ============================================================================
// createActionDomainRegistry() — Registry + Router + Composer
// ============================================================================

/**
 * Creates the action domain registry — the brain's executive function.
 *
 * This replaces the monolithic domain-action-engine switch statements
 * with a pluggable, composable, learnable architecture.
 *
 * Features:
 *   - Self-registration: domains register themselves
 *   - Semantic routing: questions → best domain(s)
 *   - Composition: chain domains into pipelines
 *   - Performance tracking: per-domain, per-business-domain
 *   - Graceful degradation: never throws, always returns
 */
export function createActionDomainRegistry(config: ActionDomainRegistryConfig = {}) {
  const {
    maxCompositionDepth = 5,
    defaultTimeoutMs = 120_000,
    verbose = false,
    onDomainCompleted,
    onDomainFailed,
    onProgress,
  } = config;

  // ── Internal State ──────────────────────────────────────────────────

  const domains = new Map<string, RegisteredActionDomain>();
  const executionHistory: DomainExecutionRecord[] = [];
  let executionCounter = 0;

  const log = verbose
    ? (...args: unknown[]) => console.log('[ActionDomainRegistry]', ...args)
    : () => {};

  // ── Query Cache (V8 — Working Memory Buffer) ─────────────────────────
  const queryCache = new Map<string, { result: ActionDomainResult; cachedAt: number; brainHash: string }>();
  const CACHE_TTL_MS = 60_000; // 1 minute
  const MAX_CACHE_SIZE = 100;
  let cacheHits = 0;
  let cacheMisses = 0;
  let cacheSavedMs = 0;

  function computeBrainHash(domainName: string, brain: ActionDomainBrainContext): string {
    return `${domainName}:${brain.primaryDomain}:${brain.extractedDomains.join(',')}:${brain.horizonDays}:${brain.question.slice(0, 100)}`;
  }

  // ── Registration ────────────────────────────────────────────────────

  function register(definition: ActionDomainDefinition): void {
    if (domains.has(definition.name)) {
      log(`Replacing existing domain: ${definition.name}`);
    }
    domains.set(definition.name, {
      definition,
      registeredAt: new Date().toISOString(),
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      avgDurationMs: 0,
      avgConfidence: 0,
      enabled: true,
      domainPerformance: new Map(),
    });
    log(`Registered domain: ${definition.name} (intents: ${definition.intents.join(', ')})`);
  }

  function unregister(name: string): boolean {
    const removed = domains.delete(name);
    if (removed) log(`Unregistered domain: ${name}`);
    return removed;
  }

  function enable(name: string): boolean {
    const domain = domains.get(name);
    if (domain) { domain.enabled = true; return true; }
    return false;
  }

  function disable(name: string): boolean {
    const domain = domains.get(name);
    if (domain) { domain.enabled = false; return true; }
    return false;
  }

  // ── Semantic Router ─────────────────────────────────────────────────

  /**
   * Routes a question to the best action domain(s).
   *
   * 3-pass routing:
   *   Pass 1: Regex fast-path (intentPatterns on each domain)
   *   Pass 2: Keyword matching (intentKeywords)
   *   Pass 3: Intent-based fallback
   *
   * Also detects composition needs and builds the plan.
   */
  function route(question: string, intent: string, extractedDomains: string[]): RouteResolution {
    const questionLower = question.toLowerCase();
    const scores = new Map<string, number>();
    const matchReasons = new Map<string, string[]>();
    const detectedIntents: Set<SemanticIntent> = new Set();

    for (const [name, registered] of domains) {
      if (!registered.enabled) continue;
      const def = registered.definition;
      let score = 0;
      const reasons: string[] = [];

      // Pass 1: Regex fast-path (highest signal)
      if (def.intentPatterns) {
        for (const pattern of def.intentPatterns) {
          if (pattern.test(question)) {
            score += 100;
            reasons.push(`regex:${pattern.source}`);
          }
        }
      }

      // Pass 2: Keyword matching
      for (const keyword of def.intentKeywords) {
        if (questionLower.includes(keyword.toLowerCase())) {
          score += 20;
          reasons.push(`keyword:${keyword}`);
        }
      }

      // Pass 3: Intent matching
      for (const domainIntent of def.intents) {
        if (domainIntent === intent) {
          score += 40;
          reasons.push(`intent:${intent}`);
          detectedIntents.add(domainIntent);
        }
        // Also check if question words map to domain intents
        if (questionLower.includes(domainIntent)) {
          score += 10;
          reasons.push(`intent-word:${domainIntent}`);
          detectedIntents.add(domainIntent);
        }
      }

      // Pass 4: Domain relevance
      if (def.relevantDomains && def.relevantDomains.length > 0) {
        for (const rd of def.relevantDomains) {
          if (extractedDomains.includes(rd)) {
            score += 5;
            reasons.push(`domain-match:${rd}`);
          }
        }
      }

      // Priority boost
      score += (def.priority || 50) / 10;

      // Historical performance bonus (domains that perform well get a boost)
      if (registered.totalExecutions > 5 && registered.avgConfidence > 0.7) {
        score += 10;
        reasons.push(`high-performer:${registered.avgConfidence.toFixed(2)}`);
      }

      if (score > 0) {
        scores.set(name, score);
        matchReasons.set(name, reasons);
      }
    }

    // Sort by score descending
    const ranked = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);

    if (ranked.length === 0) {
      // Fallback: use 'explain' domain if registered, else first available
      const fallback = domains.has('explain') ? 'explain' : Array.from(domains.keys())[0] || 'explain';
      return {
        primary: fallback,
        composition: [],
        confidence: 0.3,
        reasoning: 'No strong domain match — using fallback',
        isComposite: false,
        detectedIntents: ['general'],
      };
    }

    const primary = ranked[0][0];
    const primaryScore = ranked[0][1];

    // Detect composition: if multiple domains score high AND are composable
    const composition: string[] = [];
    const primaryDef = domains.get(primary)!.definition;

    // Check for explicit composition signals in the question
    const compositionSignals = [
      /\band\b.*\bthen\b/i,
      /comprehensive|full|complete|360|holistic|end.to.end/i,
      /build.*model|full.*analysis/i,
      /compare.*and.*explain/i,
      /forecast.*then.*recommend/i,
    ];
    const hasCompositionSignal = compositionSignals.some(r => r.test(question));

    if (hasCompositionSignal || detectedIntents.size > 1) {
      for (let i = 1; i < ranked.length && composition.length < 3; i++) {
        const candidateName = ranked[i][0];
        const candidateScore = ranked[i][1];
        // Only compose if candidate scored at least 40% of primary
        if (candidateScore >= primaryScore * 0.4) {
          const candidateDef = domains.get(candidateName)!.definition;
          // Check composability
          if (
            primaryDef.composableWith?.includes(candidateName) ||
            candidateDef.composableWith?.includes(primary) ||
            hasCompositionSignal
          ) {
            composition.push(candidateName);
          }
        }
      }
    }

    // Compute confidence from score distribution
    const maxPossible = 200; // rough upper bound
    const routeConfidence = Math.min(0.99, primaryScore / maxPossible);

    return {
      primary,
      composition,
      confidence: routeConfidence,
      reasoning: `${primary} (score=${primaryScore.toFixed(0)}, reasons=${(matchReasons.get(primary) || []).join('+')})${composition.length > 0 ? ` → compose with ${composition.join(', ')}` : ''}`,
      isComposite: composition.length > 0,
      detectedIntents: Array.from(detectedIntents),
    };
  }

  // ── Composition Engine ──────────────────────────────────────────────

  /**
   * Plans how to compose multiple domains.
   * Respects dependency ordering and parallelism opportunities.
   */
  function planComposition(primary: string, composition: string[]): CompositionPlan {
    const allDomains = [primary, ...composition];
    const steps: CompositionStep[] = [];
    const completed = new Set<string>();

    // Topological sort based on dependsOn
    let order = 0;
    let remaining = [...allDomains];
    let safetyCounter = 0;

    while (remaining.length > 0 && safetyCounter < 20) {
      safetyCounter++;
      const batch: string[] = [];

      for (const name of remaining) {
        const def = domains.get(name)?.definition;
        if (!def) continue;
        const deps = (def.dependsOn || []).filter(d => allDomains.includes(d));
        if (deps.every(d => completed.has(d))) {
          batch.push(name);
        }
      }

      if (batch.length === 0) {
        // Circular dependency or missing domain — just run remaining sequentially
        batch.push(...remaining);
        remaining = [];
      } else {
        remaining = remaining.filter(n => !batch.includes(n));
      }

      const canParallel = batch.length > 1;
      for (const name of batch) {
        const def = domains.get(name)?.definition;
        const deps = (def?.dependsOn || []).filter(d => allDomains.includes(d));
        const inputFromSteps = deps
          .map(d => steps.findIndex(s => s.domainName === d))
          .filter(i => i >= 0);

        steps.push({
          domainName: name,
          order: order,
          inputFromSteps,
          parallel: canParallel,
        });
        completed.add(name);
      }
      order++;
    }

    return {
      steps,
      estimatedDurationMs: steps.length * 2000, // rough estimate
      reasoning: `${steps.length} steps: ${steps.map(s => s.domainName).join(' → ')}`,
    };
  }

  // ── Execution ───────────────────────────────────────────────────────

  /**
   * Execute a single action domain.
   * Full brain context is injected. Graceful degradation on all paths.
   */
  async function executeDomain(
    domainName: string,
    brain: ActionDomainBrainContext,
    modules: ActionDomainBrainModules,
    depth: number = 0,
    parentResults: Map<string, ActionDomainResult> = new Map(),
  ): Promise<ActionDomainResult> {
    const registered = domains.get(domainName);
    if (!registered || !registered.enabled) {
      return {
        data: { error: `Domain '${domainName}' not found or disabled` },
        narrative: `Unable to execute ${domainName} — domain not registered.`,
        confidence: 0,
        drivers: [],
        interventions: [],
        modulesUsed: [],
        metadata: { error: true, domainName },
      };
    }

    if (depth > maxCompositionDepth) {
      return {
        data: { error: 'Max composition depth exceeded' },
        narrative: `Execution stopped — composition depth ${depth} exceeds max ${maxCompositionDepth}.`,
        confidence: 0,
        drivers: [],
        interventions: [],
        modulesUsed: [],
        metadata: { error: true, depthExceeded: true },
      };
    }

    // V8: Query cache check (working memory buffer)
    const cacheKey = computeBrainHash(domainName, brain);
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      cacheHits++;
      return { ...cached.result, metadata: { ...cached.result.metadata, cached: true, cacheAge: Date.now() - cached.cachedAt } };
    }
    cacheMisses++;

    const executionId = `exec_${Date.now()}_${++executionCounter}`;
    const startedAt = new Date().toISOString();
    const startTime = performance.now();

    // Build execution context
    const ctx: ActionDomainExecutionContext = {
      brain,
      modules,
      callDomain: (name: string, overrides?: Partial<ActionDomainBrainContext>) => {
        const mergedBrain = overrides ? { ...brain, ...overrides } : brain;
        return executeDomain(name, mergedBrain, modules, depth + 1, parentResults);
      },
      log: verbose
        ? (...args: unknown[]) => console.log(`[${domainName}]`, ...args)
        : () => {},
      reportProgress: (progress: number, message: string) => {
        if (onProgress) onProgress(domainName, progress, message);
      },
      depth,
      executionId,
    };

    try {
      // Check required capabilities
      const def = registered.definition;
      const missingRequired = def.requires.filter(cap => {
        switch (cap) {
          case 'causalDAG': return !brain.dag || brain.dag.nodes.size === 0;
          case 'timeSeries': return !brain.timeSeries || brain.timeSeries.size === 0;
          case 'temporalForecaster': return !modules.forecaster;
          case 'whatIfSimulator': return !modules.simulator;
          case 'contextAwareReasoner': return !modules.reasoner;
          case 'explanationGenerator': return !modules.explainer;
          case 'rules': return !brain.matchedRules;
          case 'patterns': return !brain.patterns;
          case 'llmAmplifier': return !modules.amplifier;
          case 'motorCommands': return !modules.motorCommandEngine;
          case 'calibrationLoop': return !modules.calibrationLoop;
          case 'agentRegistry': return !modules.agentRegistry;
          default: return false;
        }
      });

      if (missingRequired.length > 0) {
        log(`Domain ${domainName} missing required capabilities: ${missingRequired.join(', ')}`);
        // Degrade gracefully — still try to execute, brain might still produce value
      }

      // Execute the domain
      const result = await def.execute(ctx);

      // V8: Runtime type validation
      if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
        log(`Domain ${domainName} returned invalid confidence: ${result.confidence}, clamping to [0,1]`);
        result.confidence = Math.max(0, Math.min(1, result.confidence || 0));
      }
      if (!result.narrative || typeof result.narrative !== 'string') {
        result.narrative = `${domainName} analysis completed.`;
      }
      if (!Array.isArray(result.drivers)) {
        result.drivers = [];
      }

      // V8: Confidence gating — mark very low confidence results
      if (result.confidence < 0.15) {
        result.metadata = { ...result.metadata, confidenceGated: true };
        result.interventions = (result.interventions || []).map(i => ({
          ...i,
          action: `[GATED — ${(result.confidence * 100).toFixed(0)}% confidence] ${i.action}`,
        }));
      }

      // Record success
      const durationMs = performance.now() - startTime;
      registered.totalExecutions++;
      registered.successfulExecutions++;
      registered.avgDurationMs = (registered.avgDurationMs * (registered.totalExecutions - 1) + durationMs) / registered.totalExecutions;
      registered.avgConfidence = (registered.avgConfidence * (registered.totalExecutions - 1) + result.confidence) / registered.totalExecutions;

      // Track per-business-domain performance
      const bDomain = brain.primaryDomain;
      const perf = registered.domainPerformance.get(bDomain) || { executions: 0, avgConfidence: 0, avgDurationMs: 0 };
      perf.executions++;
      perf.avgConfidence = (perf.avgConfidence * (perf.executions - 1) + result.confidence) / perf.executions;
      perf.avgDurationMs = (perf.avgDurationMs * (perf.executions - 1) + durationMs) / perf.executions;
      registered.domainPerformance.set(bDomain, perf);

      // Record to history
      const record: DomainExecutionRecord = {
        executionId,
        domainName,
        question: brain.question,
        primaryDomain: brain.primaryDomain,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        success: true,
        confidence: result.confidence,
        result,
        error: null,
        compositionPlan: null,
        depth,
      };
      executionHistory.push(record);
      if (executionHistory.length > 500) executionHistory.shift();
      if (onDomainCompleted) onDomainCompleted(record);

      // V8: Cache write (working memory buffer)
      if (queryCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = queryCache.keys().next().value;
        if (oldestKey) queryCache.delete(oldestKey);
      }
      queryCache.set(cacheKey, { result, cachedAt: Date.now(), brainHash: cacheKey });
      cacheSavedMs += durationMs; // Each future cache hit saves this much

      return result;

    } catch (err) {
      const durationMs = performance.now() - startTime;
      registered.totalExecutions++;
      registered.failedExecutions++;

      const errorMessage = err instanceof Error ? err.message : String(err);
      log(`Domain ${domainName} failed: ${errorMessage}`);

      // Record failure
      const record: DomainExecutionRecord = {
        executionId,
        domainName,
        question: brain.question,
        primaryDomain: brain.primaryDomain,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        success: false,
        confidence: 0,
        result: null,
        error: errorMessage,
        compositionPlan: null,
        depth,
      };
      executionHistory.push(record);
      if (executionHistory.length > 500) executionHistory.shift();
      if (onDomainFailed) onDomainFailed(record);

      // Return failsafe data
      const failsafe = registered.definition.buildFailsafe?.(brain) || { type: domainName, error: errorMessage };
      return {
        data: failsafe,
        narrative: `${domainName} analysis could not complete: ${errorMessage}. The brain's ${domainName} pathway encountered an error.`,
        confidence: 0,
        drivers: [],
        interventions: [],
        modulesUsed: [],
        metadata: { error: true, errorMessage },
      };
    }
  }

  /**
   * Execute a full route resolution — including composition.
   * This is the primary entry point.
   */
  async function executeRoute(
    resolution: RouteResolution,
    brain: ActionDomainBrainContext,
    modules: ActionDomainBrainModules,
  ): Promise<{
    primary: ActionDomainResult;
    composed: Map<string, ActionDomainResult>;
    plan: CompositionPlan | null;
    totalDurationMs: number;
  }> {
    const startTime = performance.now();
    const results = new Map<string, ActionDomainResult>();

    if (!resolution.isComposite) {
      // Simple: just execute primary
      const primary = await executeDomain(resolution.primary, brain, modules, 0, results);
      return {
        primary,
        composed: results,
        plan: null,
        totalDurationMs: performance.now() - startTime,
      };
    }

    // Compose: plan and execute
    const plan = planComposition(resolution.primary, resolution.composition);

    // Group steps by order for parallel execution
    const orderGroups = new Map<number, CompositionStep[]>();
    for (const step of plan.steps) {
      const group = orderGroups.get(step.order) || [];
      group.push(step);
      orderGroups.set(step.order, group);
    }

    let primaryResult: ActionDomainResult | null = null;

    for (const [, group] of Array.from(orderGroups.entries()).sort((a, b) => a[0] - b[0])) {
      if (group.length === 1) {
        const step = group[0];
        const result = await executeDomain(step.domainName, brain, modules, 0, results);
        results.set(step.domainName, result);
        if (step.domainName === resolution.primary) primaryResult = result;
      } else {
        // Execute in parallel
        const promises = group.map(step =>
          executeDomain(step.domainName, brain, modules, 0, results).then(result => ({
            name: step.domainName,
            result,
          }))
        );
        const parallelResults = await Promise.allSettled(promises);
        for (const pr of parallelResults) {
          if (pr.status === 'fulfilled') {
            results.set(pr.value.name, pr.value.result);
            if (pr.value.name === resolution.primary) primaryResult = pr.value.result;
          }
        }
      }
    }

    return {
      primary: primaryResult || {
        data: { error: 'Primary domain did not produce a result' },
        narrative: 'Composition completed but primary domain failed.',
        confidence: 0,
        drivers: [],
        interventions: [],
        modulesUsed: [],
        metadata: { error: true },
      },
      composed: results,
      plan,
      totalDurationMs: performance.now() - startTime,
    };
  }

  // ── Query ───────────────────────────────────────────────────────────

  function getDomain(name: string): RegisteredActionDomain | undefined {
    return domains.get(name);
  }

  function listDomains(filter?: {
    intent?: SemanticIntent;
    tag?: string;
    enabledOnly?: boolean;
    capability?: BrainCapability;
  }): RegisteredActionDomain[] {
    let list = Array.from(domains.values());
    if (filter?.enabledOnly) list = list.filter(d => d.enabled);
    if (filter?.intent) list = list.filter(d => d.definition.intents.includes(filter.intent!));
    if (filter?.tag) list = list.filter(d => d.definition.tags?.includes(filter.tag!) ?? false);
    if (filter?.capability) list = list.filter(d => d.definition.requires.includes(filter.capability!));
    return list;
  }

  function getDomainNames(): string[] {
    return Array.from(domains.keys());
  }

  // ── Stats ───────────────────────────────────────────────────────────

  function getStats(): {
    totalDomains: number;
    enabledDomains: number;
    totalExecutions: number;
    overallSuccessRate: number;
    avgConfidence: number;
    avgDurationMs: number;
    domainBreakdown: Array<{
      name: string;
      executions: number;
      successRate: number;
      avgConfidence: number;
      avgDurationMs: number;
      enabled: boolean;
    }>;
    recentHistory: DomainExecutionRecord[];
    // V8: Query cache stats
    cacheHitRate: number;
    cacheMissRate: number;
    cacheSize: number;
    cacheHits: number;
    cacheMisses: number;
    cacheSavedMs: number;
  } {
    const all = Array.from(domains.values());
    const totalExec = all.reduce((s, d) => s + d.totalExecutions, 0);
    const totalSuccess = all.reduce((s, d) => s + d.successfulExecutions, 0);

    return {
      totalDomains: domains.size,
      enabledDomains: all.filter(d => d.enabled).length,
      totalExecutions: totalExec,
      overallSuccessRate: totalExec > 0 ? Math.round((totalSuccess / totalExec) * 100) : 100,
      avgConfidence: totalExec > 0
        ? all.reduce((s, d) => s + d.avgConfidence * d.totalExecutions, 0) / totalExec
        : 0,
      avgDurationMs: totalExec > 0
        ? Math.round(all.reduce((s, d) => s + d.avgDurationMs * d.totalExecutions, 0) / totalExec)
        : 0,
      domainBreakdown: all.map(d => ({
        name: d.definition.name,
        executions: d.totalExecutions,
        successRate: d.totalExecutions > 0
          ? Math.round((d.successfulExecutions / d.totalExecutions) * 100)
          : 100,
        avgConfidence: Math.round(d.avgConfidence * 100) / 100,
        avgDurationMs: Math.round(d.avgDurationMs),
        enabled: d.enabled,
      })),
      recentHistory: executionHistory.slice(-20),
      // V8: Query cache stats
      cacheHitRate: (cacheHits + cacheMisses) > 0 ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100) : 0,
      cacheMissRate: (cacheHits + cacheMisses) > 0 ? Math.round((cacheMisses / (cacheHits + cacheMisses)) * 100) : 100,
      cacheSize: queryCache.size,
      cacheHits,
      cacheMisses,
      cacheSavedMs: Math.round(cacheSavedMs),
    };
  }

  // ── Format ──────────────────────────────────────────────────────────

  /**
   * Format a domain result for LLM prompt injection.
   * Delegates to the domain's own formatForPrompt function.
   */
  function formatResultForPrompt(
    domainName: string,
    result: ActionDomainResult,
    brain: ActionDomainBrainContext,
  ): string {
    const registered = domains.get(domainName);
    if (!registered) return `[Unknown domain: ${domainName}]`;
    return registered.definition.formatForPrompt(result, brain);
  }

  /**
   * Format a composed result for LLM prompt.
   */
  function formatComposedForPrompt(
    resolution: RouteResolution,
    primaryResult: ActionDomainResult,
    composedResults: Map<string, ActionDomainResult>,
    brain: ActionDomainBrainContext,
  ): string {
    const sections: string[] = [];

    sections.push(`# BRAIN ANALYSIS: ${brain.question}`);
    sections.push(`Domain: ${brain.primaryDomain} | Horizon: ${brain.horizonDays}d | Route: ${resolution.primary}${resolution.composition.length > 0 ? ' → ' + resolution.composition.join(' → ') : ''}`);
    sections.push('');

    // Primary result
    sections.push(formatResultForPrompt(resolution.primary, primaryResult, brain));

    // Composed results
    for (const name of resolution.composition) {
      const result = composedResults.get(name);
      if (result && result.confidence > 0) {
        sections.push('');
        sections.push(formatResultForPrompt(name, result, brain));
      }
    }

    return sections.join('\n');
  }

  // ── Public API ──────────────────────────────────────────────────────

  return {
    // Registration
    register,
    unregister,
    enable,
    disable,

    // Routing
    route,

    // Composition
    planComposition,

    // Execution
    executeDomain,
    executeRoute,

    // Query
    getDomain,
    listDomains,
    getDomainNames,
    hasDomain: (name: string) => domains.has(name),

    // Stats
    getStats,
    getHistory: () => executionHistory.slice(),

    // Format
    formatResultForPrompt,
    formatComposedForPrompt,
  };
}

// ── Type Exports ──────────────────────────────────────────────────────

export type ActionDomainRegistry = ReturnType<typeof createActionDomainRegistry>;
