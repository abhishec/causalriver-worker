/**
 * Universal Brain Context Builder — The Prefrontal Cortex
 * ═══════════════════════════════════════════════════════════
 *
 * THE single source of truth for building LLM system prompts from brain data.
 * Assembles context from ALL 16 brain regions + trained knowledge into a
 * structured, LLM-ready prompt. Works for ANY domain — code, finance,
 * research, legal, operations, processes.
 *
 * Architecture:
 *   - All brain regions are optional (use what's available)
 *   - Trained knowledge (rules, patterns, causal edges) is optional
 *   - Intent-driven: detects what the user is asking, queries the RIGHT regions
 *   - Confidence-aware: reports uncertainty so the LLM knows its limits
 *   - Domain-aware: uses DOMAIN_KEYWORDS for entity extraction + domain detection
 *   - Generic: lives in the SDK, reusable by any app
 *
 * Brain Analog: The Prefrontal Cortex — selects which memories to bring
 * to working memory for a specific question.
 *
 * @packageDocumentation
 */

import type { KnowledgeDependencyGraphInstance } from '../core/knowledge-dependency-graph';
import type { ExpertiseGraphInstance } from '../core/expertise-graph';
import type { CollaborationGraphInstance } from '../core/collaboration-graph';
import type { CausalDAG } from '../causality/continuous-learner';
import type { MultiHopPrediction, ReasoningPath } from '../causality/multi-hop-reasoner';
import type { BrainHealthMonitor } from '../causality/brain-health-monitor';

// =============================================================================
// DOMAIN KEYWORDS — Canonical source for domain detection across ALL apps
// =============================================================================

/**
 * Domain keyword map: maps domain names to keywords that trigger them.
 * Used for domain extraction from natural language questions.
 * This is the CANONICAL source — shared with brain-knowledge-context.ts
 */
export const DOMAIN_KEYWORDS: Record<string, string[]> = {
  finance: [
    'cash', 'cash flow', 'financial', 'revenue', 'burn', 'runway', 'arr',
    'mrr', 'gross margin', 'ltv', 'payback', 'unit economics', 'p&l',
    'profit', 'loss', 'budget', 'forecast', 'ebitda', 'margin', 'cogs',
    'opex', 'capex', 'working capital', 'balance sheet', 'income statement',
    'money', 'cost', 'pricing', 'revenue model', 'funding', 'raise',
    'valuation', 'roi', 'irr', 'npv', 'dcf',
  ],
  growth: [
    'startup', 'growth', 'scaling', 'scale', 'expand', 'expansion',
    'hypergrowth', 'series', 'fundraise', 'traction', 'virality', 'pmf',
    'product-market fit', 'go-to-market', 'gtm',
  ],
  cs: [
    'customer', 'churn', 'retention', 'nrr', 'grr', 'customer success',
    'logo churn', 'renewal', 'upsell', 'expansion revenue', 'health score',
    'satisfaction', 'nps', 'csat', 'support ticket',
  ],
  marketing: [
    'marketing', 'cac', 'acquisition', 'magic number', 'plg', 'funnel',
    'conversion', 'leads', 'pipeline', 'brand', 'demand gen', 'seo',
    'content', 'paid', 'organic', 'channel', 'campaign',
  ],
  product: [
    'product', 'feature', 'self-serve', 'adoption', 'usage',
    'engagement', 'dau', 'mau', 'stickiness', 'activation',
    'ux', 'ui', 'roadmap', 'backlog', 'sprint',
  ],
  strategy: [
    'strategy', 'model', 'forecasting', 'scenario', 'plan', 'competitive',
    'moat', 'positioning', 'market', 'tam', 'sam', 'som',
  ],
  engineering: [
    'engineering', 'code', 'deploy', 'ci/cd', 'technical debt', 'architecture',
    'infrastructure', 'devops', 'reliability', 'sla', 'uptime', 'latency',
    'incidents', 'bugs', 'velocity',
  ],
  people: [
    'hiring', 'talent', 'culture', 'team', 'retention', 'attrition',
    'compensation', 'equity', 'headcount', 'org design', 'leadership',
    'manager', 'performance review',
  ],
  revenue: [
    'revenue', 'sales', 'bookings', 'arr', 'mrr', 'deal', 'pipeline',
    'quota', 'commission', 'close rate', 'win rate', 'ase', 'ae',
  ],
  macro: [
    'macro', 'economy', 'gdp', 'inflation', 'interest rate', 'fed',
    'recession', 'unemployment', 'labor', 'tariff', 'trade',
  ],
};

// =============================================================================
// TYPES — Trained Knowledge (DB rows the copilot route already loads)
// =============================================================================

/** DB-mode causal edge structure (flat rows from causal_relationships_statistical) */
export interface TrainedCausalEdge {
  source_domain: string;
  target_domain: string;
  effect_size: number;
  granger_p_value: number;
  optimal_lag_days: number;
  granger_f_statistic?: number | null;
  sample_size?: number | null;
  confidence_interval_lower?: number | null;
  confidence_interval_upper?: number | null;
  natural_language?: string | null;
  is_significant?: boolean | null;
}

/** DB-mode rule structure (from ai_memory with memory_type='rule') */
export interface TrainedRule {
  content: string;
  importance?: number;
  domain?: string;
  metadata?: Record<string, unknown> | null;
}

/** DB-mode pattern structure (from ai_memory with memory_type='pattern') */
export interface TrainedPattern {
  content: string;
  domain: string;
  importance?: number;
  llm_pattern_name?: string | null;
  llm_pattern_description?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** DB-mode cascade rule (from org_cascade_rules) */
export interface TrainedCascadeRule {
  rule_name: string;
  trigger_domain: string;
  trigger_signal_type: string;
  propagation_chain: Array<{
    source_domain: string;
    target_domain: string;
    severity: string;
    reason_template?: string;
  }>;
  is_active: boolean;
}

/** Parsed business rule (after JSON.parse of content) */
interface ParsedRule {
  title: string;
  description: string;
  naturalLanguage: string;
  entityType: string;
  when: {
    logic: 'AND' | 'OR';
    conditions: Array<{
      field: string;
      operator: string;
      value: unknown;
    }>;
  };
  then: unknown[];
  domain: string;
  isActive: boolean;
}

/** Result of evaluating a rule against entity state */
interface TriggeredRule {
  title: string;
  naturalLanguage: string;
  triggered: boolean;
  matchedConditions: string[];
  failedConditions: string[];
}

/** Impact estimation result */
interface ImpactEstimate {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  affectedDomains: string[];
  maxCascadeDepth: number;
  totalEffectMagnitude: number;
  timeToFullCascade: number;
}

// =============================================================================
// TYPES — Brain Regions + Trained Knowledge
// =============================================================================

/**
 * All brain regions the context builder can use. All are optional —
 * pass only what's available. The builder gracefully skips missing regions.
 */
export interface BrainRegions {
  // ── Structural Intelligence ──
  dependencyGraph?: KnowledgeDependencyGraphInstance;
  expertiseGraph?: ExpertiseGraphInstance;
  collaborationGraph?: CollaborationGraphInstance;

  // ── Causal Intelligence (requires CausalDAG for most methods) ──
  causalDAG?: CausalDAG;
  multiHopReasoner?: {
    reason(dag: CausalDAG, source: string, target: string): MultiHopPrediction;
    findReachableDomains(dag: CausalDAG, source: string): Array<{ domain: string; confidence: number; hops: number; lagDays: number }>;
    findCriticalEdges(dag: CausalDAG, targets: string[]): Array<{ source: string; target: string; criticality: number; affectedTargets: string[] }>;
    reasonBackward(dag: CausalDAG, effect: string): Array<{ cause: string; path: ReasoningPath; diagnosisConfidence: number }>;
    diagnose(dag: CausalDAG, effect: string, anomalyMagnitude?: number): { topCauses: Array<{ cause: string; likelihood: number; lagDays: number; path: string[]; explanation: string }>; isExplainable: boolean; narrative: string };
  };
  counterfactualSimulator?: {
    whatIf(dag: CausalDAG, intervention: { domain: string; action: string; magnitude: number }): { deltas: Array<{ domain: string; estimatedChange: number; confidence: number }>; narrative: string };
    findLeveragePoints(dag: CausalDAG, targetDomains?: string[]): Array<{ domain: string; leverageScore: number; targetImpact: number }>;
  };
  explanationGenerator?: {
    explainAnomaly(anomaly: { domain: string; metric: string; deviation: number; detectedAt: Date }, dag: CausalDAG, recentSignals?: Array<{ domain: string; signalType: string; value: number; timestamp: Date }>): { rootCauses: Array<{ cause: string; likelihood: number; explanation: string }>; narrative: string };
    generateBriefing(dag: CausalDAG, recentChanges?: unknown[], topInsights?: unknown[]): { summary: string; sections: Array<{ title: string; content: string }> };
    summarizePath(path: ReasoningPath): string;
  };
  cascadeTracker?: {
    getActiveCascades(organizationId?: string): Array<{ cascadeId: string; triggerDomain: string; expectedPath: string[]; actualPath: string[]; currentStage: number; probability: number; severityScore: number; status: string }>;
    getStats(organizationId?: string): { totalCascades: number; activeCascades: number; interventionSuccessRate: number; avgStagesReached: number };
  };

  // ── Predictive Intelligence ──
  temporalForecaster?: {
    forecast(allSeries: Map<string, { values: number[]; dates: Date[] }>, dag: CausalDAG, targetDomain: string, horizonDays?: number): { points: Array<{ day: number; predicted: number; lower: number; upper: number }>; method: string; confidence: number };
  };
  timeSeries?: Map<string, number[]>;

  // ── Introspective Intelligence ──
  brainHealthMonitor?: BrainHealthMonitor;
  uncertaintyQuantifier?: {
    findHighestUncertaintyEdges(dag: CausalDAG, topN?: number, referenceDate?: Date): Array<{ source: string; target: string; uncertainty: number; reason: string }>;
    computeDAGConfidenceQuality(dag: CausalDAG, referenceDate?: Date): { quality: number; category: string; edgeCount: number; highUncertaintyCount: number };
  };

  // ── Attention ──
  attentionMechanism?: {
    summarizeAttention(dag: CausalDAG, context: { focusDomains: string[]; queryType?: string }, topN?: number): { boosted: Array<{ source: string; target: string; baseWeight: number; adjustedWeight: number; reasons: string[] }>; dampened: Array<{ source: string; target: string; baseWeight: number; adjustedWeight: number; reasons: string[] }> };
  };

  // ── Trained Knowledge (DB rows — rules, patterns, causal edges, cascade rules) ──
  trainedKnowledge?: {
    causalEdges?: TrainedCausalEdge[];
    rules?: TrainedRule[];
    patterns?: TrainedPattern[];
    cascadeRules?: TrainedCascadeRule[];
    /** Entity state for rule evaluation (e.g., { finance: { arr: 5000000 }, cs: { nrr: 1.1 } }) */
    entityState?: Record<string, unknown>;
    /** Impact estimator function (can be injected from the platform layer) */
    estimateImpact?: (domain: string, edges: TrainedCausalEdge[]) => ImpactEstimate;
  };

  // ── Conversation Context ──
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;

  // ── Persona Configuration ──
  persona?: {
    name: string;
    description: string;
  };
}

/** Unified intent detection across ALL domains. */
export type BrainIntent =
  // Structural (code/knowledge)
  | 'onboarding'    // "How does X work?"
  | 'debugging'     // "Why does X fail?"
  | 'incident'      // "X is down"
  | 'knowledge'     // "Who knows about X?"
  | 'review'        // "What does this change affect?"
  // Causal (business/ops)
  | 'explain'       // "Why did X happen?"
  | 'predict'       // "What will happen to X?"
  | 'diagnose'      // "Why is X declining?"
  | 'whatif'        // "What if we change X?"
  | 'cascade'       // "What's the ripple effect?"
  | 'build'         // "Build me a model/template/dashboard"
  // Introspective
  | 'health'        // "How healthy is our data/brain?"
  | 'uncertainty'   // "What are we uncertain about?"
  // General
  | 'general';

/** A context section contributed by one brain region. */
export interface BrainContextSection {
  region: string;       // e.g., "dependency-graph", "multi-hop-reasoner"
  title: string;        // e.g., "## Causal Chain Analysis"
  content: string;      // Markdown content
  relevance: number;    // 0-1, how relevant to the question
}

/** The assembled brain context, ready for LLM consumption. */
export interface BrainContext {
  intent: BrainIntent;
  entities: string[];
  /** Detected business domains from question (e.g., ['finance', 'cs']) */
  domains: string[];
  sections: BrainContextSection[];
  fullPrompt: string;          // Combined markdown for LLM system prompt
  confidence: number;          // 0-1, overall confidence in the context
  uncertainAreas: string[];    // What the brain doesn't know
  regionsUsed: string[];       // Which brain regions contributed
}

// =============================================================================
// INTENT DETECTION — Unified across all domains
// =============================================================================

const INTENT_PATTERNS: Array<{ intent: BrainIntent; patterns: RegExp[] }> = [
  // Build intent (from UserIntent — must come first to catch "build"/"create"/"design")
  {
    intent: 'build',
    patterns: [
      /\bbuild\b/i, /\bcreate\b/i, /\bdesign\b/i, /\bgenerate\b/i,
      /forecast model/i, /spreadsheet/i, /\bdashboard\b/i, /\bformula\b/i,
      /\btemplate\b/i,
    ],
  },
  // Structural intents
  {
    intent: 'onboarding',
    patterns: [
      /how does .+ work/i, /explain .+ (code|module|service|function|class|system|flow|logic)/i,
      /new to .+ (codebase|repo|project)/i, /what (is|does) .+ (do|handle|manage)/i,
      /walk me through/i, /architecture of/i, /overview of/i, /getting started/i,
      /understand .+ (code|codebase|system)/i, /tell me about .+ (module|service|code|system|feature)/i,
    ],
  },
  {
    intent: 'debugging',
    patterns: [
      /error in/i, /fails when/i, /root cause/i, /bug in/i, /debug/i,
      /why (does|is|did) .+ (fail|break|crash|error)/i, /trace .+ error/i,
      /stack trace/i, /what causes/i, /fix .+ issue/i, /not working/i,
    ],
  },
  {
    intent: 'incident',
    patterns: [
      /incident/i, /outage/i, /service .+ (down|unavailable)/i,
      /p[01] .+ (incident|issue|alert)/i, /production .+ (issue|error|failure)/i,
      /blast radius/i, /what .+ affected/i, /impact .+ (outage|failure)/i,
    ],
  },
  {
    intent: 'knowledge',
    patterns: [
      /who knows/i, /bus factor/i, /expertise/i, /expert on/i,
      /who (should|can) .+ (review|help|fix)/i, /knowledge .+ (transfer|retention|risk)/i,
      /single point of failure/i, /sole expert/i, /team .+ (knows|owns)/i,
    ],
  },
  {
    intent: 'review',
    patterns: [
      /review .+ (pr|pull request|change|commit)/i, /pr .+ (impact|affect|change)/i,
      /what (does|will) .+ (change|break|affect)/i, /impact (of|if) .+ change/i,
      /downstream .+ (impact|effect|consumers)/i, /who should review/i,
      /reviewer .+ (suggest|recommend)/i, /changes to/i, /what breaks/i,
    ],
  },
  // Causal intents
  {
    intent: 'whatif',
    patterns: [
      /what if/i, /what would happen/i, /simulate/i, /scenario/i,
      /if we (change|increase|decrease|stop|start|double|halve)/i,
      /impact of (changing|increasing|decreasing)/i,
    ],
  },
  {
    intent: 'predict',
    patterns: [
      /predict/i, /forecast/i, /project .+ (next|future)/i,
      /what will .+ (be|look like|happen)/i, /estimate .+ (next|future)/i,
      /trend .+ (next|coming|future)/i,
    ],
  },
  {
    intent: 'diagnose',
    patterns: [
      /diagnose/i, /why is .+ (declining|dropping|increasing|spiking)/i,
      /root cause .+ (decline|drop|increase|spike)/i,
      /investigate .+ (drop|decline|increase)/i,
      /what.s (wrong|causing|driving)/i,
    ],
  },
  {
    intent: 'cascade',
    patterns: [
      /cascade/i, /ripple effect/i, /chain reaction/i,
      /domino effect/i, /propagat/i, /downstream impact/i,
      /if .+ fails? .+ what .+ affected/i,
    ],
  },
  {
    intent: 'explain',
    patterns: [
      /explain/i, /why did/i, /how does .+ cause/i,
      /what is the (relationship|connection) between/i,
      /tell me about .+ (relationship|connection|link)/i,
      /how are .+ (related|connected|linked)/i,
    ],
  },
  // Introspective intents
  {
    intent: 'health',
    patterns: [
      /brain health/i, /data quality/i, /how (healthy|reliable|accurate)/i,
      /calibration/i, /cognitive load/i, /model (health|quality)/i,
    ],
  },
  {
    intent: 'uncertainty',
    patterns: [
      /uncertain/i, /confidence/i, /how sure/i, /reliable/i,
      /what .+ (don.t|do not) know/i, /knowledge gap/i,
      /where .+ (weak|unreliable)/i,
    ],
  },
];

export function detectIntent(question: string): BrainIntent {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(question))) {
      return intent;
    }
  }
  return 'general';
}

// =============================================================================
// DOMAIN EXTRACTION — Keyword-based domain detection
// =============================================================================

/**
 * Extract relevant business domains from a question using keyword matching.
 * Falls back to ['finance', 'strategy'] when no domain keywords are detected.
 */
export function extractDomains(question: string): string[] {
  const lower = question.toLowerCase();
  const domains: string[] = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        if (!domains.includes(domain)) domains.push(domain);
        break;
      }
    }
  }

  // Fallback: if no domains detected, use general defaults
  if (domains.length === 0) {
    domains.push('finance', 'strategy');
  }

  return domains;
}

// =============================================================================
// ENTITY EXTRACTION — Works for any domain
// =============================================================================

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'must', 'ought',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
  'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
  'how', 'when', 'where', 'why', 'if', 'then', 'else', 'so', 'but',
  'and', 'or', 'not', 'no', 'nor', 'for', 'with', 'without', 'about',
  'from', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'to', 'of', 'in', 'on', 'at', 'by', 'up', 'down', 'out',
  'off', 'over', 'under', 'again', 'further', 'all', 'any', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'only',
  'own', 'same', 'than', 'too', 'very', 'just', 'because', 'as',
  'until', 'while', 'also', 'between', 'every', 'tell',
  'work', 'works', 'working', 'explain', 'show', 'tell', 'give',
  'help', 'find', 'look', 'see', 'know', 'understand', 'get',
  'make', 'use', 'using', 'does', 'happen', 'happens',
  'code', 'codebase', 'file', 'files', 'function', 'class',
  'system', 'project', 'repo', 'repository',
]);

/**
 * Extract entities from any question — works for code, finance, research, etc.
 *
 * Strategy:
 * 1. File paths (e.g., src/auth/handler.ts)
 * 2. Quoted identifiers (e.g., "@calcom/prisma", "churn_rate")
 * 3. Module/concept suffix patterns (e.g., "auth module", "revenue model")
 * 4. Fuzzy keyword fallback — meaningful nouns from natural language
 */
export function extractEntities(question: string): string[] {
  const entities: string[] = [];

  // Strategy 1: File paths
  const pathMatch = question.match(
    /[\w\-./]+\.(ts|tsx|js|jsx|py|go|rs|java|rb|vue|svelte|sql|yaml|yml|json|toml)/gi
  );
  if (pathMatch) entities.push(...pathMatch);

  // Strategy 2: Quoted identifiers
  const quotedMatch = question.match(/[`"']([^`"']+)[`"']/g);
  if (quotedMatch) {
    for (const q of quotedMatch) {
      entities.push(q.replace(/[`"']/g, ''));
    }
  }

  // Strategy 3: Concept suffix patterns (code + business + research)
  const suffixes = [
    // code
    'module', 'service', 'handler', 'component', 'controller', 'package',
    'library', 'utility', 'helper', 'api', 'endpoint', 'feature', 'layer',
    'page', 'route', 'middleware', 'schema', 'model', 'database', 'table',
    'hook', 'context', 'provider', 'store', 'pipeline', 'engine', 'worker',
    // business
    'metric', 'kpi', 'indicator', 'signal', 'rate', 'ratio', 'score',
    'index', 'factor', 'coefficient', 'margin', 'revenue', 'cost',
    // research
    'paper', 'study', 'theory', 'hypothesis', 'experiment', 'dataset',
    // process
    'workflow', 'process', 'procedure', 'policy', 'rule', 'domain',
  ];
  const suffixPattern = new RegExp(
    `(?:the\\s+)?(\\w[\\w-]+)\\s+(?:${suffixes.join('|')})`,
    'gi'
  );
  const moduleMatch = question.match(suffixPattern);
  if (moduleMatch) {
    for (const m of moduleMatch) {
      const suffixRe = new RegExp(`\\s+(?:${suffixes.join('|')})$`, 'i');
      const name = m.replace(suffixRe, '').replace(/^the\s+/i, '').trim();
      if (name.length > 1) entities.push(name);
    }
  }

  // Strategy 4: Fuzzy keyword fallback — meaningful nouns
  if (entities.length === 0) {
    const words = question
      .toLowerCase()
      .replace(/[^a-z0-9\s\-_@/]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
    for (const word of words) {
      entities.push(word);
    }
  }

  return [...new Set(entities)];
}

// =============================================================================
// USE-CASE HINTS — Intent-specific instructions for the LLM
// =============================================================================

function getIntentHint(intent: BrainIntent): string {
  switch (intent) {
    case 'onboarding':
      return 'Explain architecture, key modules, and who to ask for help. Be welcoming and thorough.';
    case 'debugging':
      return 'Trace upstream dependencies for root cause analysis. Show error propagation paths.';
    case 'incident':
      return 'Assess blast radius, identify affected services, and suggest expert contacts for each affected area.';
    case 'knowledge':
      return 'Show bus factor risks, expertise distribution, and suggest knowledge transfer actions.';
    case 'review':
      return 'Analyze impact of changes, suggest reviewers based on expertise, and flag risky downstream effects.';
    case 'explain':
      return 'Trace causal chains with evidence. Show which relationships are strongest. Cite specific edges with statistics.';
    case 'predict':
      return 'Show forecasts with confidence intervals. Use cascade paths to trace forward effects. Note where the brain is uncertain.';
    case 'diagnose':
      return 'Identify root causes ranked by likelihood. Walk the causal cascade paths step by step. Show which rules fired and why.';
    case 'whatif':
      return 'Show simulated impact with confidence bounds. Compare alternative interventions.';
    case 'cascade':
      return 'Show propagation paths, timing, and intervention opportunities.';
    case 'build':
      return 'Use the brain\'s causal edges to define model structure. Use effect sizes as coefficients, lag days as time delays. Generate actual formulas or code using these numbers.';
    case 'health':
      return 'Report on data quality, calibration, cognitive load, and areas needing improvement.';
    case 'uncertainty':
      return 'Show what the brain is most uncertain about, weakest relationships, and data gaps.';
    default:
      return '';
  }
}

// =============================================================================
// ENTITY STATE NORMALIZER — Maps domain keys → canonical rule field paths
// =============================================================================

/**
 * Normalizes entity state so that domain-specific keys (finance.arr, cs.nrr)
 * map to canonical rule field paths (metrics.arr, metrics.nrr).
 * This ensures rules fire correctly regardless of how the user provides data.
 */
export function normalizeEntityState(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...raw };

  // Map finance.* → metrics.*
  const finance = raw.finance as Record<string, unknown> | undefined;
  if (finance && typeof finance === 'object') {
    const metrics: Record<string, unknown> = {
      ...(raw.metrics as Record<string, unknown> || {}),
    };
    if (finance.arr !== undefined) metrics.arr = finance.arr;
    if (finance.arr_growth_rate !== undefined) {
      metrics.arr_growth_rate = finance.arr_growth_rate;
      metrics.arr_growth_pct = typeof finance.arr_growth_rate === 'number'
        ? finance.arr_growth_rate * 100
        : finance.arr_growth_rate;
    }
    if (finance.burn_multiple !== undefined) metrics.burn_multiple = finance.burn_multiple;
    if (finance.gross_margin !== undefined) {
      metrics.gross_margin = finance.gross_margin;
      metrics.gross_margin_pct = typeof finance.gross_margin === 'number'
        ? finance.gross_margin * 100
        : finance.gross_margin;
    }
    if (finance.cac_payback_months !== undefined) metrics.cac_payback_months = finance.cac_payback_months;
    if (finance.ltv_cac_ratio !== undefined) metrics.ltv_cac_ratio = finance.ltv_cac_ratio;
    if (finance.cash_runway_months !== undefined) {
      metrics.cash_runway_months = finance.cash_runway_months;
      metrics.runway_months = finance.cash_runway_months;
    }
    if (finance.rule_of_40_score !== undefined) metrics.rule_of_40_score = finance.rule_of_40_score;
    if (finance.revenue_per_employee !== undefined) metrics.revenue_per_employee = finance.revenue_per_employee;
    if (finance.ebitda_margin !== undefined) metrics.ebitda_margin = finance.ebitda_margin;
    if (finance.working_capital_ratio !== undefined) metrics.working_capital_ratio = finance.working_capital_ratio;
    if (finance.quick_ratio !== undefined) metrics.quick_ratio = finance.quick_ratio;
    normalized.metrics = metrics;
  }

  // Map cs.nrr → metrics.nrr
  const cs = raw.cs as Record<string, unknown> | undefined;
  if (cs && typeof cs === 'object') {
    const metrics = normalized.metrics as Record<string, unknown> || {};
    if (cs.nrr !== undefined) metrics.nrr = cs.nrr;
    if (cs.logo_churn_rate_annual !== undefined) {
      metrics.logo_churn_rate_annual = cs.logo_churn_rate_annual;
      metrics.churn_rate = cs.logo_churn_rate_annual;
    }
    normalized.metrics = metrics;
  }

  // Map marketing.magic_number → metrics.magic_number
  const marketing = raw.marketing as Record<string, unknown> | undefined;
  if (marketing && typeof marketing === 'object') {
    const metrics = normalized.metrics as Record<string, unknown> || {};
    if (marketing.magic_number !== undefined) metrics.magic_number = marketing.magic_number;
    if (marketing.plg_revenue_pct !== undefined) metrics.plg_revenue_pct = marketing.plg_revenue_pct;
    if (marketing.cac !== undefined) metrics.cac = marketing.cac;
    normalized.metrics = metrics;
  }

  // Flatten top-level domain aliases
  if (raw.runway_months !== undefined) {
    const metrics = normalized.metrics as Record<string, unknown> || {};
    metrics.runway_months = raw.runway_months;
    metrics.cash_runway_months = raw.runway_months;
    normalized.metrics = metrics;
  }

  // Map nrr.trailing_12m → metrics.nrr
  const nrr = raw.nrr as Record<string, unknown> | undefined;
  if (nrr && typeof nrr === 'object' && nrr.trailing_12m !== undefined) {
    const metrics = normalized.metrics as Record<string, unknown> || {};
    metrics.nrr = nrr.trailing_12m;
    normalized.metrics = metrics;
  }

  // Map grr.trailing_12m → metrics.grr
  const grr = raw.grr as Record<string, unknown> | undefined;
  if (grr && typeof grr === 'object' && grr.trailing_12m !== undefined) {
    const metrics = normalized.metrics as Record<string, unknown> || {};
    metrics.grr = grr.trailing_12m;
    normalized.metrics = metrics;
  }

  // Ensure company.* aliases for company-type rules
  if (!normalized.company) {
    normalized.company = { ...(finance || {}) };
  }

  return normalized;
}

// =============================================================================
// RULE PARSER + EVALUATOR — Parse DB rules and evaluate against entity state
// =============================================================================

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(
  condition: { field: string; operator: string; value: unknown },
  entityState: Record<string, unknown>,
): boolean {
  const actual = getNestedValue(entityState, condition.field);
  if (actual === undefined || actual === null) return false;

  const expected = condition.value;
  const numActual = typeof actual === 'number' ? actual : parseFloat(String(actual));
  const numExpected = typeof expected === 'number' ? expected : parseFloat(String(expected));

  switch (condition.operator) {
    case '<': return numActual < numExpected;
    case '<=': return numActual <= numExpected;
    case '>': return numActual > numExpected;
    case '>=': return numActual >= numExpected;
    case '==': case '===': return actual === expected || numActual === numExpected;
    case '!=': case '!==': return actual !== expected && numActual !== numExpected;
    default: return false;
  }
}

function parseDBRules(rules: TrainedRule[]): ParsedRule[] {
  const parsed: ParsedRule[] = [];
  for (const r of rules) {
    try {
      const p = JSON.parse(r.content);
      if (p && p.when && p.entity_type) {
        parsed.push({
          title: p.title || 'Untitled Rule',
          description: p.description || '',
          naturalLanguage: p.natural_language || p.naturalLanguage || p.description || '',
          entityType: p.entity_type,
          when: p.when,
          then: p.then || [],
          domain: r.domain || 'general',
          isActive: p.is_active !== false,
        });
      }
    } catch {
      // Skip malformed rules
    }
  }
  return parsed;
}

function evaluateRules(
  parsedRules: ParsedRule[],
  entityState: Record<string, unknown>,
): TriggeredRule[] {
  const results: TriggeredRule[] = [];

  for (const rule of parsedRules) {
    if (!rule.isActive || !rule.when?.conditions) continue;

    const matchedConditions: string[] = [];
    const failedConditions: string[] = [];

    for (const cond of rule.when.conditions) {
      const passed = evaluateCondition(cond, entityState);
      const desc = `${cond.field} ${cond.operator} ${cond.value}`;
      if (passed) {
        matchedConditions.push(desc);
      } else {
        failedConditions.push(desc);
      }
    }

    const triggered =
      rule.when.logic === 'AND'
        ? failedConditions.length === 0 && matchedConditions.length > 0
        : matchedConditions.length > 0;

    results.push({
      title: rule.title,
      naturalLanguage: rule.naturalLanguage || rule.description || '',
      triggered,
      matchedConditions,
      failedConditions,
    });
  }

  return results;
}

// =============================================================================
// BFS CASCADE PATH FINDER — Find multi-hop paths through the causal graph
// =============================================================================

function bfsPathsTo(
  adjacency: Record<string, Array<{ target: string; effect: number; lag: number }>>,
  source: string,
  target: string,
  maxDepth: number,
): string[] {
  const results: string[] = [];
  const queue: Array<{ node: string; path: string[]; totalEffect: number; totalLag: number }> = [
    { node: source, path: [source], totalEffect: 1, totalLag: 0 },
  ];

  while (queue.length > 0) {
    const { node, path, totalEffect, totalLag } = queue.shift()!;
    if (path.length > maxDepth + 1) continue;

    if (node === target && path.length > 1) {
      results.push(
        `${path.join(' -> ')} (effect: ${(totalEffect * 100).toFixed(1)}%, lag: ${totalLag}d)`
      );
      continue;
    }

    const neighbors = adjacency[node] || [];
    for (const n of neighbors) {
      if (path.includes(n.target)) continue;
      queue.push({
        node: n.target,
        path: [...path, n.target],
        totalEffect: totalEffect * n.effect,
        totalLag: totalLag + n.lag,
      });
    }
  }

  return results.sort((a, b) => {
    const effectA = parseFloat(a.match(/effect: ([\d.-]+)%/)?.[1] || '0');
    const effectB = parseFloat(b.match(/effect: ([\d.-]+)%/)?.[1] || '0');
    return Math.abs(effectB) - Math.abs(effectA);
  });
}

function findCascadePathsBFS(
  edges: TrainedCausalEdge[],
  queryDomains: string[],
  primaryDomain: string,
): string[] {
  const results: string[] = [];
  const adjacency: Record<string, Array<{ target: string; effect: number; lag: number }>> = {};

  for (const e of edges) {
    if (e.is_significant === false) continue;
    if (!adjacency[e.source_domain]) adjacency[e.source_domain] = [];
    adjacency[e.source_domain].push({
      target: e.target_domain,
      effect: e.effect_size,
      lag: e.optimal_lag_days,
    });
  }

  const feederDomains = ['marketing', 'cs', 'product', 'engineering', 'people', 'revenue', 'macro'];
  const sources = [...new Set([...feederDomains, ...queryDomains])];

  for (const source of sources) {
    if (source === primaryDomain) continue;
    const paths = bfsPathsTo(adjacency, source, primaryDomain, 4);
    for (const path of paths.slice(0, 3)) {
      results.push(path);
    }
  }

  for (let i = 0; i < queryDomains.length; i++) {
    for (let j = 0; j < queryDomains.length; j++) {
      if (i === j) continue;
      const paths = bfsPathsTo(adjacency, queryDomains[i], queryDomains[j], 4);
      for (const path of paths.slice(0, 2)) {
        if (!results.includes(path)) results.push(path);
      }
    }
  }

  return results;
}

// =============================================================================
// DEFAULT IMPACT ESTIMATOR — BFS-based cascade impact estimation
// =============================================================================

function defaultEstimateImpact(domain: string, edges: TrainedCausalEdge[]): ImpactEstimate {
  const activeEdges = edges.filter((e) => e.is_significant !== false);

  const adjacency: Record<string, Array<{ target: string; effect: number; lag: number }>> = {};
  for (const e of activeEdges) {
    if (!adjacency[e.source_domain]) adjacency[e.source_domain] = [];
    adjacency[e.source_domain].push({
      target: e.target_domain,
      effect: e.effect_size,
      lag: e.optimal_lag_days,
    });
  }

  const visited = new Set<string>();
  const queue: Array<{ node: string; depth: number; effectSoFar: number; lagSoFar: number }> = [
    { node: domain, depth: 0, effectSoFar: 1, lagSoFar: 0 },
  ];

  let maxDepth = 0;
  let totalEffect = 0;
  let maxLag = 0;

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visited.has(item.node) || item.depth > 4) continue;
    visited.add(item.node);

    if (item.depth > 0) {
      totalEffect += Math.abs(item.effectSoFar);
      maxDepth = Math.max(maxDepth, item.depth);
      maxLag = Math.max(maxLag, item.lagSoFar);
    }

    const neighbors = adjacency[item.node] || [];
    for (const n of neighbors) {
      if (!visited.has(n.target)) {
        queue.push({
          node: n.target,
          depth: item.depth + 1,
          effectSoFar: item.effectSoFar * n.effect,
          lagSoFar: item.lagSoFar + n.lag,
        });
      }
    }
  }

  const affectedDomains = [...visited].filter((d) => d !== domain);
  const riskLevel: ImpactEstimate['riskLevel'] =
    affectedDomains.length >= 5 || totalEffect > 2 ? 'critical' :
    affectedDomains.length >= 3 || totalEffect > 1 ? 'high' :
    affectedDomains.length >= 1 ? 'medium' : 'low';

  return {
    riskLevel,
    affectedDomains,
    maxCascadeDepth: maxDepth,
    totalEffectMagnitude: totalEffect,
    timeToFullCascade: maxLag,
  };
}

// =============================================================================
// SECTION BUILDERS — Live Brain Regions
// =============================================================================

function buildDependencySection(
  depGraph: KnowledgeDependencyGraphInstance,
  intent: BrainIntent,
  entities: string[],
): BrainContextSection | null {
  const stats = depGraph.getStats();
  if (stats.totalEdges === 0) return null;

  const lines: string[] = [
    `## Dependency Graph`,
    `- ${stats.totalEdges} edges across ${stats.uniqueEntities} entities`,
    `- Domains: ${Object.entries(stats.byDomain).map(([d, c]) => `${d}(${c})`).join(', ')}`,
    `- Cycles: ${stats.cycleCount}`,
  ];

  // Resolve entities via fuzzy search
  let resolvedIds: string[] = [];
  if (entities.length > 0) {
    for (const entity of entities) {
      try {
        const impact = depGraph.analyzeImpact(entity);
        if (impact.totalImpactRadius > 0) resolvedIds.push(entity);
      } catch { /* not found */ }
    }
    if (resolvedIds.length === 0) {
      const fuzzy = depGraph.fuzzySearchEntities(entities, 10);
      resolvedIds = fuzzy.map((r) => r.entityId);
    }
  }

  for (const entityId of resolvedIds.slice(0, 3)) {
    try {
      const impact = depGraph.analyzeImpact(entityId);
      if (impact.totalImpactRadius > 0) {
        lines.push('');
        lines.push(`### Impact: ${entityId}`);
        lines.push(`- Direct dependents: ${impact.directDependents.length}`);
        lines.push(`- Transitive impact radius: ${impact.totalImpactRadius}`);
        lines.push(`- Risk score: ${(impact.riskScore * 100).toFixed(0)}%`);
        lines.push(`- Affected domains: ${impact.affectedDomains.join(', ')}`);
        if (impact.criticalPaths.length > 0) {
          lines.push(`- Critical paths: ${impact.criticalPaths.slice(0, 3).map((p) => p.join(' → ')).join('; ')}`);
        }
      }
    } catch { /* not found */ }
  }

  if (intent === 'onboarding') {
    const hubs = depGraph.getTopHubs(10);
    if (hubs.length > 0) {
      lines.push('', `### Architecture Hotspots:`);
      for (const hub of hubs) {
        const tag = hub.domain ? ` [${hub.domain}]` : '';
        lines.push(`  - ${hub.entityId} (fan-in: ${hub.fanIn}, fan-out: ${hub.fanOut})${tag}`);
      }
    }
    const domains = depGraph.getDomainBreakdown();
    if (domains.length > 0) {
      lines.push('', `### Domain Architecture:`);
      for (const d of domains.slice(0, 8)) {
        lines.push(`  - ${d.domain}: ${d.entityCount} entities`);
      }
    }
    if (resolvedIds.length > 0) {
      lines.push('', `### Entities matching "${entities.join(', ')}":`);
      for (const eid of resolvedIds.slice(0, 8)) {
        const domain = depGraph.mapEntityToDomain(eid);
        lines.push(`  - ${eid}${domain ? ` [${domain}]` : ''}`);
      }
    }
  }

  if (intent === 'debugging' || intent === 'incident') {
    for (const entityId of resolvedIds.slice(0, 3)) {
      const upstream = depGraph.queryDependencies({ entityId, direction: 'upstream', limit: 10 });
      if (upstream.length > 0) {
        lines.push('', `### Upstream deps of ${entityId} (potential root causes):`);
        for (const dep of upstream.slice(0, 8)) {
          lines.push(`  - ${dep.sourceId} → ${dep.targetId} (${dep.dependencyType}, weight: ${dep.weight.toFixed(2)})`);
        }
      }
      if (intent === 'incident') {
        const downstream = depGraph.queryDependencies({ entityId, direction: 'downstream', limit: 10 });
        if (downstream.length > 0) {
          lines.push('', `### Downstream deps of ${entityId} (blast radius):`);
          for (const dep of downstream.slice(0, 8)) {
            lines.push(`  - ${dep.sourceId} → ${dep.targetId} (${dep.dependencyType}, weight: ${dep.weight.toFixed(2)})`);
          }
        }
      }
    }
    if (resolvedIds.length === 0 && entities.length > 0) {
      const fuzzy = depGraph.fuzzySearchEntities(entities, 5);
      if (fuzzy.length > 0) {
        lines.push('', `### Entities matching "${entities.join(', ')}":`);
        for (const f of fuzzy) lines.push(`  - ${f.entityId}${f.domain ? ` [${f.domain}]` : ''}`);
      }
    }
  }

  if (intent === 'review') {
    for (const entityId of resolvedIds.slice(0, 2)) {
      const downstream = depGraph.queryDependencies({ entityId, direction: 'downstream', limit: 15 });
      if (downstream.length > 0) {
        lines.push('', `### Downstream consumers of ${entityId} (affected by changes):`);
        for (const dep of downstream.slice(0, 10)) {
          lines.push(`  - ${dep.sourceId} → ${dep.targetId} (${dep.dependencyType})`);
        }
      }
    }
  }

  return {
    region: 'dependency-graph',
    title: '## Dependency Graph',
    content: lines.join('\n'),
    relevance: resolvedIds.length > 0 ? 0.9 : 0.5,
  };
}

function buildExpertiseSection(
  expertiseGraph: ExpertiseGraphInstance,
  intent: BrainIntent,
  entities: string[],
): BrainContextSection | null {
  const stats = expertiseGraph.getStats();
  if (stats.totalEdges === 0) return null;

  const lines: string[] = [
    `## Expertise Map`,
    `- ${stats.uniqueContributors} contributors across ${stats.uniqueTopics} topics`,
  ];

  const queried = new Set<string>();
  for (const entity of entities.slice(0, 5)) {
    if (queried.has(entity.toLowerCase())) continue;
    queried.add(entity.toLowerCase());
    const experts = expertiseGraph.queryExperts({ topic: entity, limit: 5 });
    if (experts.length > 0) {
      lines.push('', `### Experts for "${entity}":`);
      for (const exp of experts) {
        lines.push(`  - ${exp.contributorName || exp.contributorId} (strength: ${(exp.strength * 100).toFixed(0)}%, evidence: ${exp.evidenceCount} contributions)`);
      }
    }
  }

  if (intent === 'knowledge' || intent === 'incident' || intent === 'onboarding') {
    const heatmap = expertiseGraph.getHeatmap(intent === 'knowledge' ? 30 : 15);
    if (intent === 'knowledge') {
      const singleExpert: string[] = [];
      for (const [topic, edges] of heatmap) {
        if (edges.length === 1 && edges[0].strength > 0.3) {
          singleExpert.push(`${topic} (only: ${edges[0].contributorName || edges[0].contributorId})`);
        }
      }
      if (singleExpert.length > 0) {
        lines.push('', `### Bus Factor Warnings (single expert):`);
        for (const t of singleExpert.slice(0, 10)) lines.push(`  - ⚠️ ${t}`);
      }
    }
    if (intent === 'onboarding') {
      lines.push('', `### Top Expertise Areas (who to ask):`);
      let shown = 0;
      for (const [topic, edges] of heatmap) {
        if (shown >= 10) break;
        const top = edges[0];
        lines.push(`  - ${topic}: ${edges.length} expert${edges.length > 1 ? 's' : ''}, top: ${top.contributorName || top.contributorId} (${(top.strength * 100).toFixed(0)}%)`);
        shown++;
      }
    }
  }

  return {
    region: 'expertise-graph',
    title: '## Expertise Map',
    content: lines.join('\n'),
    relevance: ['knowledge', 'incident', 'review', 'onboarding'].includes(intent) ? 0.9 : 0.5,
  };
}

function buildCollaborationSection(
  collabGraph: CollaborationGraphInstance,
  intent: BrainIntent,
): BrainContextSection | null {
  const stats = collabGraph.getNetworkStats();
  if (stats.totalEdges === 0) return null;

  const lines: string[] = [
    `## Collaboration Network`,
    `- ${stats.totalEdges} edges across ${stats.uniqueContributors} contributors`,
    `- Teams: ${stats.uniqueTeams}, Cross-team: ${stats.crossTeamEdges}`,
    `- Density: ${(stats.density * 100).toFixed(1)}%`,
  ];

  if (['incident', 'review', 'knowledge', 'onboarding'].includes(intent)) {
    const bridges = collabGraph.getBridgeContributors(5);
    if (bridges.length > 0) {
      lines.push('', `### Bridge Contributors (connect teams):`);
      for (const b of bridges) {
        lines.push(`  - ${b.contributor}: bridges ${b.teams.join(', ')} (${b.crossTeamEdges} cross-team edges)`);
      }
    }
  }

  if (intent === 'onboarding') {
    const crossTeam = collabGraph.getCrossTeamEdges();
    if (crossTeam.length > 0) {
      const teamPairs = new Map<string, number>();
      for (const edge of crossTeam.slice(0, 50)) {
        const pair = [edge.teamA || 'unknown', edge.teamB || 'unknown'].sort().join(' ↔ ');
        teamPairs.set(pair, (teamPairs.get(pair) || 0) + 1);
      }
      const sorted = Array.from(teamPairs.entries()).sort((a, b) => b[1] - a[1]);
      lines.push('', `### Cross-Team Collaboration:`);
      for (const [pair, count] of sorted.slice(0, 8)) {
        lines.push(`  - ${pair}: ${count} interactions`);
      }
    }
  }

  return {
    region: 'collaboration-graph',
    title: '## Collaboration Network',
    content: lines.join('\n'),
    relevance: ['knowledge', 'incident', 'onboarding'].includes(intent) ? 0.8 : 0.3,
  };
}

function buildMultiHopSection(
  reasoner: NonNullable<BrainRegions['multiHopReasoner']>,
  dag: CausalDAG,
  intent: BrainIntent,
  entities: string[],
): BrainContextSection | null {
  const lines: string[] = ['## Causal Reasoning'];

  try {
    if (intent === 'diagnose' && entities.length > 0) {
      const diagnosis = reasoner.diagnose(dag, entities[0]);
      if (diagnosis.topCauses.length > 0) {
        lines.push('', `### Root Cause Diagnosis for "${entities[0]}":`);
        lines.push(`${diagnosis.narrative}`);
        for (const cause of diagnosis.topCauses.slice(0, 5)) {
          lines.push(`  - ${cause.cause}: ${(cause.likelihood * 100).toFixed(0)}% likelihood (lag: ${cause.lagDays}d)`);
          lines.push(`    Path: ${cause.path.join(' → ')}`);
        }
      }
    }

    if ((intent === 'explain' || intent === 'cascade') && entities.length >= 2) {
      const prediction = reasoner.reason(dag, entities[0], entities[1]);
      if (prediction.totalPaths > 0) {
        lines.push('', `### Causal Chain: ${entities[0]} → ${entities[1]}`);
        lines.push(`- Confidence: ${(prediction.reasoning.confidence * 100).toFixed(0)}%`);
        if (prediction.bestPath) {
          lines.push(`- Estimated lag: ${prediction.bestPath.totalLagDays} days`);
        }
        const allPaths = [prediction.bestPath, ...prediction.alternativePaths].filter(Boolean);
        for (const path of allPaths.slice(0, 3)) {
          if (path) {
            lines.push(`  - ${path.nodes.join(' → ')} (strength: ${(path.pathConfidence * 100).toFixed(0)}%)`);
          }
        }
      }
    }

    if (['explain', 'cascade', 'general'].includes(intent) && entities.length > 0) {
      const reachable = reasoner.findReachableDomains(dag, entities[0]);
      if (reachable.length > 0) {
        lines.push('', `### Domains reachable from "${entities[0]}":`);
        for (const r of reachable.slice(0, 8)) {
          lines.push(`  - ${r.domain}: ${(r.confidence * 100).toFixed(0)}% confidence, ${r.hops} hops, ~${r.lagDays}d lag`);
        }
      }
    }

    if (intent === 'debugging' && entities.length > 0) {
      const backward = reasoner.reasonBackward(dag, entities[0]);
      if (backward.length > 0) {
        lines.push('', `### Potential upstream causes of "${entities[0]}":`);
        for (const b of backward.slice(0, 5)) {
          lines.push(`  - ${b.cause}: ${(b.diagnosisConfidence * 100).toFixed(0)}% confidence`);
        }
      }
    }
  } catch { /* graceful degradation */ }

  if (lines.length <= 1) return null;

  return {
    region: 'multi-hop-reasoner',
    title: '## Causal Reasoning',
    content: lines.join('\n'),
    relevance: ['diagnose', 'explain', 'cascade', 'debugging'].includes(intent) ? 0.95 : 0.4,
  };
}

function buildCounterfactualSection(
  simulator: NonNullable<BrainRegions['counterfactualSimulator']>,
  dag: CausalDAG,
  intent: BrainIntent,
  entities: string[],
): BrainContextSection | null {
  if (intent !== 'whatif' && intent !== 'cascade') return null;
  const lines: string[] = ['## What-If Analysis'];

  try {
    if (entities.length > 0) {
      const result = simulator.whatIf(dag, {
        domain: entities[0],
        action: 'increase',
        magnitude: 0.1,
      });
      if (result.deltas && result.deltas.length > 0) {
        lines.push('', `### If "${entities[0]}" increases by 10%:`);
        for (const d of result.deltas.slice(0, 8)) {
          const dir = d.estimatedChange > 0 ? '↑' : '↓';
          lines.push(`  - ${d.domain}: ${dir} ${(Math.abs(d.estimatedChange) * 100).toFixed(1)}% (confidence: ${(d.confidence * 100).toFixed(0)}%)`);
        }
        if (result.narrative) lines.push('', result.narrative);
      }
    }

    const leverage = simulator.findLeveragePoints(dag);
    if (leverage.length > 0) {
      lines.push('', `### Highest Leverage Points:`);
      for (const lp of leverage.slice(0, 5)) {
        lines.push(`  - ${lp.domain}: leverage score ${lp.leverageScore.toFixed(2)}`);
      }
    }
  } catch { /* graceful degradation */ }

  if (lines.length <= 1) return null;

  return {
    region: 'counterfactual-simulator',
    title: '## What-If Analysis',
    content: lines.join('\n'),
    relevance: 0.9,
  };
}

function buildCascadeSection(
  tracker: NonNullable<BrainRegions['cascadeTracker']>,
  intent: BrainIntent,
): BrainContextSection | null {
  if (!['incident', 'cascade', 'diagnose'].includes(intent)) return null;

  try {
    const stats = tracker.getStats();
    if (stats.totalCascades === 0) return null;

    const lines: string[] = [
      `## Active Cascades`,
      `- Total: ${stats.totalCascades}, Active: ${stats.activeCascades}`,
      `- Intervention success rate: ${(stats.interventionSuccessRate * 100).toFixed(0)}%`,
    ];

    const active = tracker.getActiveCascades();
    for (const c of active.slice(0, 5)) {
      lines.push('');
      lines.push(`### Cascade: ${c.triggerDomain} → ${c.expectedPath.join(' → ')}`);
      lines.push(`  - Stage: ${c.currentStage}/${c.expectedPath.length}`);
      lines.push(`  - Probability: ${(c.probability * 100).toFixed(0)}%, Severity: ${(c.severityScore * 100).toFixed(0)}%`);
      lines.push(`  - Status: ${c.status}`);
    }

    return {
      region: 'cascade-tracker',
      title: '## Active Cascades',
      content: lines.join('\n'),
      relevance: 0.9,
    };
  } catch { return null; }
}

function buildHealthSection(
  monitor: BrainHealthMonitor,
  dag: CausalDAG | undefined,
  intent: BrainIntent,
): BrainContextSection | null {
  if (!['health', 'uncertainty', 'general'].includes(intent)) return null;
  if (!dag) return null;

  try {
    const lines: string[] = ['## Brain Health'];

    if (intent === 'health' || intent === 'general') {
      const report = monitor.generateHealthReport(dag, []);
      lines.push(`- Overall health: ${(report.overallHealth * 100).toFixed(0)}%`);
      lines.push(`- Cognitive load: ${report.cognitiveLoad?.load !== undefined ? (report.cognitiveLoad.load * 100).toFixed(0) + '%' : 'N/A'}`);

      const priorities = monitor.whatShouldIPrioritize(dag, []);
      if (priorities.length > 0) {
        lines.push('', `### Priority improvements:`);
        for (const p of priorities.slice(0, 5)) lines.push(`  - ${p}`);
      }
    }

    if (intent === 'uncertainty' || intent === 'health') {
      const uncertain = monitor.whatAmIMostUncertainAbout(dag, 5);
      if (uncertain.length > 0) {
        lines.push('', `### Most uncertain relationships:`);
        for (const u of uncertain) {
          lines.push(`  - ${u.source} → ${u.target}: uncertainty ${(u.uncertainty * 100).toFixed(0)}%`);
        }
      }

      const degrading = monitor.whereAmIDegrading();
      if (degrading.length > 0) {
        lines.push('', `### Degrading areas:`);
        for (const d of degrading.slice(0, 5)) {
          lines.push(`  - ${(d as { domain?: string }).domain || 'unknown'} (accuracy declining)`);
        }
      }
    }

    if (lines.length <= 1) return null;

    return {
      region: 'brain-health-monitor',
      title: '## Brain Health',
      content: lines.join('\n'),
      relevance: intent === 'health' ? 0.95 : 0.4,
    };
  } catch { return null; }
}

function buildUncertaintySection(
  quantifier: NonNullable<BrainRegions['uncertaintyQuantifier']>,
  dag: CausalDAG,
  intent: BrainIntent,
): BrainContextSection | null {
  if (!['uncertainty', 'health', 'review', 'predict'].includes(intent)) return null;

  try {
    const lines: string[] = ['## Uncertainty Analysis'];

    const quality = quantifier.computeDAGConfidenceQuality(dag);
    lines.push(`- DAG confidence quality: ${(quality.quality * 100).toFixed(0)}% (${quality.category})`);
    lines.push(`- Edges: ${quality.edgeCount}, High uncertainty: ${quality.highUncertaintyCount}`);

    const topUncertain = quantifier.findHighestUncertaintyEdges(dag, 5);
    if (topUncertain.length > 0) {
      lines.push('', `### Least certain relationships:`);
      for (const e of topUncertain) {
        lines.push(`  - ${e.source} → ${e.target}: ${(e.uncertainty * 100).toFixed(0)}% uncertain — ${e.reason}`);
      }
    }

    return {
      region: 'uncertainty-quantifier',
      title: '## Uncertainty Analysis',
      content: lines.join('\n'),
      relevance: intent === 'uncertainty' ? 0.95 : 0.5,
    };
  } catch { return null; }
}

function buildAttentionSection(
  attention: NonNullable<BrainRegions['attentionMechanism']>,
  dag: CausalDAG,
  intent: BrainIntent,
  entities: string[],
): BrainContextSection | null {
  if (!['explain', 'diagnose', 'predict', 'whatif'].includes(intent)) return null;
  if (entities.length === 0) return null;

  try {
    const summary = attention.summarizeAttention(dag, {
      focusDomains: entities.slice(0, 3),
      queryType: intent === 'predict' ? 'forecasting' : intent === 'whatif' ? 'what_if' : 'general',
    }, 5);

    if (summary.boosted.length === 0 && summary.dampened.length === 0) return null;

    const lines: string[] = ['## Attention-Weighted Analysis'];

    if (summary.boosted.length > 0) {
      lines.push('', `### Most relevant edges (boosted):`);
      for (const b of summary.boosted.slice(0, 5)) {
        lines.push(`  - ${b.source} → ${b.target}: ${b.baseWeight.toFixed(2)} → ${b.adjustedWeight.toFixed(2)} (${b.reasons.join(', ')})`);
      }
    }

    return {
      region: 'attention-mechanism',
      title: '## Attention-Weighted Analysis',
      content: lines.join('\n'),
      relevance: 0.6,
    };
  } catch { return null; }
}

// =============================================================================
// SECTION BUILDERS — Trained Knowledge (rules, patterns, causal edges from DB)
// =============================================================================

function buildTrainedKnowledgeSection(
  knowledge: NonNullable<BrainRegions['trainedKnowledge']>,
  intent: BrainIntent,
  domains: string[],
  entityState?: Record<string, unknown>,
): BrainContextSection | null {
  const edges = (knowledge.causalEdges || []).filter((e) => e.is_significant !== false);
  const rules = knowledge.rules || [];
  const patterns = knowledge.patterns || [];
  const cascadeRules = knowledge.cascadeRules || [];

  if (edges.length === 0 && rules.length === 0 && patterns.length === 0) return null;

  const primaryDomain = domains[0] || 'finance';
  const allDomains = new Set([
    ...edges.map((e) => e.source_domain),
    ...edges.map((e) => e.target_domain),
  ]);

  const lines: string[] = [
    `## Brain Knowledge Context`,
    `Domains detected: ${domains.join(', ')} | ` +
    `Total Domains: ${allDomains.size} | ` +
    `Causal Edges: ${edges.length} | ` +
    `Business Rules: ${rules.length} | ` +
    `Patterns: ${patterns.length} | ` +
    `Cascade Rules: ${cascadeRules.length} | ` +
    `Intent: ${intent}`,
  ];

  // ── Direct Causes per domain ──
  for (const domain of domains) {
    const causes = edges
      .filter((e) => e.target_domain === domain)
      .sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size));
    if (causes.length > 0) {
      lines.push(`\n### What DRIVES ${domain}? (Direct Causes)`);
      for (const c of causes.slice(0, 10)) {
        lines.push(
          `- ${c.source_domain} -> ${domain}: effect=${(c.effect_size * 100).toFixed(1)}%, lag=${c.optimal_lag_days}d, p=${c.granger_p_value.toFixed(4)}${c.natural_language ? ' -- ' + c.natural_language : ''}`
        );
      }
    }
  }

  // ── Direct Effects per domain ──
  for (const domain of domains) {
    const effects = edges
      .filter((e) => e.source_domain === domain)
      .sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size));
    if (effects.length > 0) {
      lines.push(`\n### What does ${domain} AFFECT? (Direct Effects)`);
      for (const e of effects.slice(0, 10)) {
        lines.push(
          `- ${domain} -> ${e.target_domain}: effect=${(e.effect_size * 100).toFixed(1)}%, lag=${e.optimal_lag_days}d, p=${e.granger_p_value.toFixed(4)}${e.natural_language ? ' -- ' + e.natural_language : ''}`
        );
      }
    }
  }

  // ── Discovered Patterns ──
  const relevantPatterns = patterns.filter((p) =>
    domains.includes(p.domain) || domains.some((d) => p.content.toLowerCase().includes(d))
  );
  if (relevantPatterns.length > 0) {
    lines.push(`\n### Discovered Patterns (${relevantPatterns.length} relevant)`);
    for (const p of relevantPatterns.slice(0, 20)) {
      const name = p.llm_pattern_name || p.domain;
      const desc = p.llm_pattern_description || p.content.substring(0, 200);
      lines.push(`- [${p.domain}] ${name}: ${desc}`);
    }
    if (relevantPatterns.length > 20) {
      lines.push(`  ... and ${relevantPatterns.length - 20} more patterns`);
    }
  }

  // ── Cascade Paths (multi-hop via BFS) ──
  const cascadePaths = findCascadePathsBFS(edges, domains, primaryDomain);
  if (cascadePaths.length > 0) {
    lines.push(`\n### Cross-Domain Cascade Paths`);
    for (const p of cascadePaths.slice(0, 15)) {
      lines.push(`- ${p}`);
    }
  }

  // ── Cascade Rules from org_cascade_rules ──
  const activeCascades = cascadeRules.filter((r) => r.is_active);
  if (activeCascades.length > 0) {
    lines.push(`\n### Active Cascade Alert Rules`);
    for (const r of activeCascades.slice(0, 10)) {
      const chain = r.propagation_chain
        .map((c) => `${c.source_domain} -> ${c.target_domain} [${c.severity}]`)
        .join(', ');
      lines.push(`- ${r.rule_name}: ${chain}`);
    }
  }

  // ── Business Rules + Evaluation ──
  const parsedRules = parseDBRules(rules);
  if (parsedRules.length > 0) {
    lines.push(`\n### Trained Business Rules`);
    for (const r of parsedRules.slice(0, 15)) {
      lines.push(`- [${r.domain}] ${r.title}: ${r.naturalLanguage}`);
    }
  }

  // Evaluate rules against entity state
  let triggeredRules: TriggeredRule[] = [];
  const normalizedState = entityState ? normalizeEntityState(entityState) : undefined;
  if (normalizedState && Object.keys(normalizedState).length > 0) {
    triggeredRules = evaluateRules(parsedRules, normalizedState);
    const fired = triggeredRules.filter((r) => r.triggered);
    if (fired.length > 0) {
      lines.push(`\n### 🔴 TRIGGERED Rules (${fired.length} fired)`);
      for (const r of fired) {
        lines.push(`- [FIRED] ${r.title}: ${r.naturalLanguage}`);
        lines.push(`  Matched: ${r.matchedConditions.join(' | ')}`);
      }
    }
    const nearMiss = triggeredRules.filter(
      (r) => !r.triggered && r.matchedConditions.length > 0
    );
    if (nearMiss.length > 0) {
      lines.push(`\n### ⚠️ Near-Miss Rules (${nearMiss.length} partially matched)`);
      for (const r of nearMiss.slice(0, 5)) {
        lines.push(
          `- ${r.title}: matched ${r.matchedConditions.length}/${r.matchedConditions.length + r.failedConditions.length} conditions`
        );
        lines.push(`  Failed: ${r.failedConditions.join(' | ')}`);
      }
    }
  }

  // ── Impact Analysis ──
  const estimator = knowledge.estimateImpact || defaultEstimateImpact;
  for (const domain of domains) {
    const impact = estimator(domain, edges);
    if (impact.affectedDomains.length > 0) {
      lines.push(`\n### Impact Analysis: ${domain}`);
      lines.push(`- Risk Level: ${impact.riskLevel.toUpperCase()}`);
      lines.push(`- Affected domains: ${impact.affectedDomains.join(', ')}`);
      lines.push(`- Cascade depth: ${impact.maxCascadeDepth} hops`);
      lines.push(`- Total effect magnitude: ${impact.totalEffectMagnitude.toFixed(2)}`);
      lines.push(`- Time to full cascade: ${impact.timeToFullCascade} days`);
    }
  }

  // ── Strongest Relationships ──
  const strongest = [...edges]
    .sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size))
    .slice(0, 10);
  if (strongest.length > 0) {
    lines.push(`\n### Strongest Relationships in Brain`);
    for (const r of strongest) {
      lines.push(
        `- ${r.source_domain} -> ${r.target_domain}: effect=${(r.effect_size * 100).toFixed(1)}%, lag=${r.optimal_lag_days}d, p=${r.granger_p_value.toFixed(4)}`
      );
    }
  }

  // ── Most Influential Domains ──
  const domainInfluence: Record<string, number> = {};
  for (const e of edges) {
    domainInfluence[e.source_domain] = (domainInfluence[e.source_domain] || 0) + Math.abs(e.effect_size);
  }
  const sortedInfluence = Object.entries(domainInfluence)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  if (sortedInfluence.length > 0) {
    lines.push(`\n### Most Influential Domains`);
    for (const [d, inf] of sortedInfluence) {
      lines.push(`- ${d}: influence=${inf.toFixed(2)}`);
    }
  }

  return {
    region: 'trained-knowledge',
    title: '## Brain Knowledge Context',
    content: lines.join('\n'),
    relevance: 0.95, // Trained knowledge is always highly relevant
  };
}

// =============================================================================
// CONVERSATION CONTEXT BUILDER
// =============================================================================

function buildConversationSummary(history: Array<{ role: 'user' | 'assistant'; content: string }>): string | undefined {
  if (!history || history.length === 0) return undefined;

  const recentMessages = history.slice(-6); // Last 3 exchanges
  const summary: string[] = [
    'Previous conversation context (last few exchanges):',
  ];

  for (const msg of recentMessages) {
    const prefix = msg.role === 'user' ? 'User' : 'Copilot';
    const truncated =
      msg.content.length > 200 ? msg.content.substring(0, 200) + '...' : msg.content;
    summary.push(`- ${prefix}: ${truncated}`);
  }

  return summary.join('\n');
}

// =============================================================================
// INTENT-AWARE SYSTEM PROMPT BUILDER — The LLM persona + instructions
// =============================================================================

function buildSystemPromptHeader(
  intent: BrainIntent,
  regionsUsed: string[],
  trainedKnowledge: BrainRegions['trainedKnowledge'],
  entityState?: Record<string, unknown>,
  triggeredRuleCount?: number,
  persona?: BrainRegions['persona'],
): string {
  const tk = trainedKnowledge;
  const edgeCount = (tk?.causalEdges || []).filter((e) => e.is_significant !== false).length;
  const ruleCount = (tk?.rules || []).length;
  const patternCount = (tk?.patterns || []).length;
  const cascadeCount = (tk?.cascadeRules || []).length;

  const allDomains = new Set([
    ...(tk?.causalEdges || []).map((e) => e.source_domain),
    ...(tk?.causalEdges || []).map((e) => e.target_domain),
  ]);

  const personaName = persona?.name || 'NexusBrain Copilot';
  const personaDesc = persona?.description || 'powered by NexusBrain';

  const lines: string[] = [];

  lines.push(`You are the ${personaName} ${personaDesc}. You have access to a trained causal knowledge graph with ${allDomains.size} domains, ${edgeCount} causal edges, ${ruleCount} business rules, ${patternCount} statistical patterns, and ${cascadeCount} cascade rules.`);

  if (regionsUsed.length > 0) {
    lines.push(`\nAdditionally, the following live brain regions are active: ${regionsUsed.join(', ')}.`);
  }

  lines.push(`\nCRITICAL: When answering, you MUST use the brain's discovered parameters (effect sizes, lag days, p-values) from the context below. Do NOT use generic knowledge. Every claim must be grounded in the brain's data.`);

  // Entity state note
  if (entityState && Object.keys(entityState).length > 0) {
    lines.push(`\nThe user has provided their current metrics. ${triggeredRuleCount || 0} business rules have FIRED — highlight these in your response.`);
  } else if (edgeCount > 0) {
    lines.push(`\nNo entity state was provided. If your answer would benefit from specific metrics, ask the user to share their current ARR, burn rate, churn, etc.`);
  }

  // Intent-specific instructions
  lines.push('');
  switch (intent) {
    case 'build':
      lines.push(
        'When the user asks to BUILD something (model, forecast, template):',
        '- Use the brain\'s causal edges to define the model structure',
        '- Use the brain\'s effect sizes as actual coefficients',
        '- Use the brain\'s lag days as time delays',
        '- Reference specific patterns that apply to their domain',
        '- Generate actual formulas or code using these numbers',
      );
      break;
    case 'explain':
    case 'onboarding':
      lines.push(
        'When the user asks to EXPLAIN something:',
        '- Cite specific causal edges with their statistics',
        '- Reference matched patterns with significance levels',
        '- Quote the brain\'s discovered relationships, not generic advice',
      );
      break;
    case 'diagnose':
    case 'debugging':
    case 'incident':
      lines.push(
        'When the user asks to DIAGNOSE something:',
        '- Walk the causal cascade paths step by step',
        '- Show which rules fired and why (with matched conditions)',
        '- Reference the impact analysis (risk level, affected domains, cascade depth)',
        '- Show near-miss rules that partially matched',
      );
      break;
    case 'predict':
    case 'whatif':
    case 'cascade':
      lines.push(
        'When the user asks to PREDICT something:',
        '- Use the brain\'s cascade paths to trace forward effects',
        '- Use the impact estimates to quantify risk',
        '- Reference specific effect sizes and lag days as parameters',
        '- Quantify uncertainty using p-values and sample sizes',
      );
      break;
    default:
      break;
  }

  lines.push('');
  lines.push('Format your answers clearly with short paragraphs. Use bullet points for lists. When citing brain data, use the exact numbers from the context.');

  return lines.join('\n');
}

// =============================================================================
// FACTORY — The single entry point
// =============================================================================

export function createBrainContextBuilder(regions: BrainRegions) {
  /**
   * Build context from all available brain regions for the given question.
   * Automatically detects intent and queries only relevant regions.
   *
   * This is the SINGLE source of truth for building LLM system prompts.
   * It replaces BOTH:
   *   - The inline buildBrainContext() from the copilot route (trained knowledge)
   *   - The old brain-context-builder (live brain regions)
   */
  function buildContext(question: string): BrainContext {
    const intent = detectIntent(question);
    const entities = extractEntities(question);
    const domains = extractDomains(question);
    const sections: BrainContextSection[] = [];
    const regionsUsed: string[] = [];
    const uncertainAreas: string[] = [];

    // ── Trained Knowledge (rules, patterns, causal edges from DB) ──
    if (regions.trainedKnowledge) {
      const section = buildTrainedKnowledgeSection(
        regions.trainedKnowledge,
        intent,
        domains,
        regions.trainedKnowledge.entityState,
      );
      if (section) { sections.push(section); regionsUsed.push('trained-knowledge'); }
    }

    // ── Structural Intelligence ──
    if (regions.dependencyGraph) {
      const section = buildDependencySection(regions.dependencyGraph, intent, entities);
      if (section) { sections.push(section); regionsUsed.push('dependency-graph'); }
    }

    if (regions.expertiseGraph) {
      const section = buildExpertiseSection(regions.expertiseGraph, intent, entities);
      if (section) { sections.push(section); regionsUsed.push('expertise-graph'); }
    }

    if (regions.collaborationGraph) {
      const section = buildCollaborationSection(regions.collaborationGraph, intent);
      if (section) { sections.push(section); regionsUsed.push('collaboration-graph'); }
    }

    // ── Causal Intelligence (requires DAG) ──
    if (regions.causalDAG) {
      if (regions.multiHopReasoner) {
        const section = buildMultiHopSection(regions.multiHopReasoner, regions.causalDAG, intent, entities);
        if (section) { sections.push(section); regionsUsed.push('multi-hop-reasoner'); }
      }

      if (regions.counterfactualSimulator) {
        const section = buildCounterfactualSection(regions.counterfactualSimulator, regions.causalDAG, intent, entities);
        if (section) { sections.push(section); regionsUsed.push('counterfactual-simulator'); }
      }

      if (regions.cascadeTracker) {
        const section = buildCascadeSection(regions.cascadeTracker, intent);
        if (section) { sections.push(section); regionsUsed.push('cascade-tracker'); }
      }

      // ── Introspective Intelligence ──
      if (regions.brainHealthMonitor) {
        const section = buildHealthSection(regions.brainHealthMonitor, regions.causalDAG, intent);
        if (section) { sections.push(section); regionsUsed.push('brain-health-monitor'); }
      }

      if (regions.uncertaintyQuantifier) {
        const section = buildUncertaintySection(regions.uncertaintyQuantifier, regions.causalDAG, intent);
        if (section) { sections.push(section); regionsUsed.push('uncertainty-quantifier'); }
      }

      // ── Attention-Weighted Analysis ──
      if (regions.attentionMechanism) {
        const section = buildAttentionSection(regions.attentionMechanism, regions.causalDAG, intent, entities);
        if (section) { sections.push(section); regionsUsed.push('attention-mechanism'); }
      }
    } else {
      if (regions.multiHopReasoner || regions.counterfactualSimulator || regions.uncertaintyQuantifier) {
        uncertainAreas.push('Causal DAG not loaded — multi-hop reasoning, counterfactual simulation, and uncertainty analysis are unavailable');
      }
    }

    // ── Track what's missing ──
    if (!regions.dependencyGraph) uncertainAreas.push('No dependency graph loaded — structural analysis unavailable');
    if (!regions.expertiseGraph) uncertainAreas.push('No expertise graph loaded — who-knows-what analysis unavailable');
    if (!regions.collaborationGraph) uncertainAreas.push('No collaboration graph loaded — team network analysis unavailable');

    // ── Compute confidence (domain-aware) ──
    let confidence = 0;
    let maxWeight = 0;

    // Trained knowledge is worth 40% of confidence
    if (regionsUsed.includes('trained-knowledge')) { confidence += 0.4; maxWeight += 0.4; }
    else maxWeight += 0.4;

    // Structural regions are worth 20% total
    const structuralCount = ['dependency-graph', 'expertise-graph', 'collaboration-graph']
      .filter((r) => regionsUsed.includes(r)).length;
    confidence += (structuralCount / 3) * 0.2;
    maxWeight += 0.2;

    // Causal regions are worth 25% total
    const causalCount = ['multi-hop-reasoner', 'counterfactual-simulator', 'cascade-tracker']
      .filter((r) => regionsUsed.includes(r)).length;
    confidence += (causalCount / 3) * 0.25;
    maxWeight += 0.25;

    // Introspective regions are worth 15% total
    const introspectiveCount = ['brain-health-monitor', 'uncertainty-quantifier', 'attention-mechanism']
      .filter((r) => regionsUsed.includes(r)).length;
    confidence += (introspectiveCount / 3) * 0.15;
    maxWeight += 0.15;

    confidence = Math.min(1, confidence);

    // ── Conversation context ──
    const conversationSummary = buildConversationSummary(regions.conversationHistory || []);

    // ── Sort sections by relevance ──
    sections.sort((a, b) => b.relevance - a.relevance);

    // ── Count triggered rules for header ──
    let triggeredRuleCount = 0;
    if (regions.trainedKnowledge?.entityState && regions.trainedKnowledge?.rules) {
      const normalizedState = normalizeEntityState(regions.trainedKnowledge.entityState);
      const parsedRules = parseDBRules(regions.trainedKnowledge.rules);
      const results = evaluateRules(parsedRules, normalizedState);
      triggeredRuleCount = results.filter((r) => r.triggered).length;
    }

    // ── Assemble full prompt ──
    const promptParts: string[] = [];

    // System prompt header with persona + intent-specific instructions
    promptParts.push(buildSystemPromptHeader(
      intent,
      regionsUsed.filter((r) => r !== 'trained-knowledge'), // don't list trained-knowledge as a "live region"
      regions.trainedKnowledge,
      regions.trainedKnowledge?.entityState,
      triggeredRuleCount,
      regions.persona,
    ));

    // Conversation context
    if (conversationSummary) {
      promptParts.push('', '### Conversation Context', conversationSummary);
    }

    // Brain context sections
    promptParts.push('');
    for (const s of sections) {
      promptParts.push(s.content);
    }

    if (uncertainAreas.length > 0) {
      promptParts.push('', '## Brain Limitations', ...uncertainAreas.map((u) => `- ${u}`));
    }

    const fullPrompt = promptParts.filter(Boolean).join('\n');

    return {
      intent,
      entities,
      domains,
      sections,
      fullPrompt,
      confidence,
      uncertainAreas,
      regionsUsed,
    };
  }

  return {
    buildContext,
    detectIntent,
    extractEntities,
    extractDomains,
    normalizeEntityState,
  };
}

export type BrainContextBuilder = ReturnType<typeof createBrainContextBuilder>;
