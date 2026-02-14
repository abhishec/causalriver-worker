/**
 * Dispatch Assessor V1 — Unified Complexity + Intent Scoring
 * ===========================================================
 *
 * Brain Analog: Anterior Cingulate Cortex (ACC)
 *   — conflict monitoring, effort estimation, cognitive routing
 *
 * The ACC decides WHERE to send a query based on:
 *   1. Complexity scoring (how hard is this question?)
 *   2. Intent classification (what does the user want?)
 *   3. Domain detection (what business areas are involved?)
 *   4. Capability matching (what brain subsystems are needed?)
 *
 * Dispatch Routes:
 *   - FAST_QUERY: Simple factual lookups → direct DB query + format
 *   - ACTION_DOMAIN: Single-domain computations → DomainActionEngine
 *   - AGENT_ORCHESTRATION: Multi-step, multi-domain → NexusOrchestrator + AgentRegistry
 *
 * Design: Pure function. No side effects. Sub-1ms latency.
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** Where to dispatch the query */
export type DispatchRoute =
  | 'fast_query'
  | 'action_domain'
  | 'agent_orchestration';

/** What the user wants to accomplish */
export type UserIntent =
  | 'lookup'        // Simple fact retrieval
  | 'explain'       // Why/how questions
  | 'predict'       // Future-oriented
  | 'simulate'      // What-if scenarios
  | 'diagnose'      // Root-cause analysis
  | 'build'         // Create models/forecasts
  | 'compare'       // Cross-domain comparisons
  | 'monitor'       // Health/status checks
  | 'optimize'      // Improve metrics
  | 'recommend'     // Suggest actions
  | 'audit'         // Compliance/risk checks
  | 'general';      // Conversational / unknown

/** Business domains that NexusBrain understands */
export type BusinessDomain =
  | 'finance'
  | 'growth'
  | 'cs'
  | 'marketing'
  | 'product'
  | 'strategy'
  | 'engineering'
  | 'people'
  | 'revenue'
  | 'operations'
  | 'compliance';

/** The full assessment result */
export interface DispatchAssessment {
  /** Primary dispatch route */
  route: DispatchRoute;
  /** Detected user intent */
  intent: UserIntent;
  /** Detected business domains (ordered by relevance) */
  domains: BusinessDomain[];
  /** Primary domain */
  primaryDomain: BusinessDomain;
  /** Complexity score 0-1 (0 = trivial, 1 = extremely complex) */
  complexityScore: number;
  /** Breakdown of complexity factors */
  complexityFactors: ComplexityFactors;
  /** Required brain capabilities for this query */
  requiredCapabilities: string[];
  /** Whether this query needs LLM generation */
  needsLLM: boolean;
  /** Whether this query needs action artifacts (forecasts, simulations, etc.) */
  needsAction: boolean;
  /** Confidence in the assessment (0-1) */
  confidence: number;
  /** Assessment latency in ms */
  latencyMs: number;
}

/** Breakdown of what makes a query complex */
export interface ComplexityFactors {
  /** Number of domains involved */
  domainCount: number;
  /** Whether temporal analysis is needed */
  requiresTemporal: boolean;
  /** Whether causal reasoning is needed */
  requiresCausal: boolean;
  /** Whether counterfactual simulation is needed */
  requiresCounterfactual: boolean;
  /** Whether multi-step execution is needed */
  requiresMultiStep: boolean;
  /** Whether the query references specific metrics */
  hasSpecificMetrics: boolean;
  /** Whether the query asks for comparison */
  isComparison: boolean;
  /** Token complexity estimate */
  estimatedTokens: number;
}

// ============================================================================
// DOMAIN KEYWORD MAP
// ============================================================================

const DOMAIN_KEYWORDS: Record<BusinessDomain, string[]> = {
  finance: ['cash', 'financial', 'revenue', 'burn', 'runway', 'arr', 'mrr', 'margin', 'budget', 'cost', 'pricing', 'roi', 'ebitda', 'gross margin', 'net income', 'p&l', 'balance sheet', 'capex', 'opex', 'unit economics'],
  growth: ['growth', 'scaling', 'scale', 'expand', 'fundraise', 'traction', 'pmf', 'product-market fit', 'series', 'valuation'],
  cs: ['customer', 'churn', 'retention', 'nrr', 'renewal', 'upsell', 'nps', 'csat', 'support', 'ticket', 'sla', 'satisfaction', 'customer success'],
  marketing: ['marketing', 'cac', 'acquisition', 'funnel', 'conversion', 'leads', 'pipeline', 'campaign', 'seo', 'brand', 'content', 'paid', 'organic'],
  product: ['product', 'feature', 'adoption', 'usage', 'engagement', 'dau', 'mau', 'activation', 'roadmap', 'sprint', 'backlog', 'release'],
  strategy: ['strategy', 'forecasting', 'scenario', 'competitive', 'market', 'tam', 'moat', 'positioning', 'oks', 'okrs', 'vision'],
  engineering: ['engineering', 'code', 'deploy', 'technical debt', 'architecture', 'devops', 'incidents', 'velocity', 'ci/cd', 'infrastructure', 'latency', 'uptime', 'bugs'],
  people: ['hiring', 'talent', 'culture', 'team', 'retention', 'attrition', 'compensation', 'headcount', 'performance review', 'eNPS'],
  revenue: ['revenue', 'sales', 'bookings', 'deal', 'quota', 'win rate', 'close rate', 'asp', 'arpu', 'ltv', 'acv'],
  operations: ['operations', 'process', 'efficiency', 'workflow', 'automation', 'supply chain', 'logistics'],
  compliance: ['compliance', 'regulation', 'audit', 'risk', 'security', 'gdpr', 'soc2', 'iso', 'policy'],
};

// ============================================================================
// INTENT PATTERNS
// ============================================================================

interface IntentPattern {
  intent: UserIntent;
  patterns: RegExp[];
  keywords: string[];
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'predict',
    patterns: [/what\s+will/, /forecast\s+\d+/, /project\s+\d+/, /next\s+(quarter|month|year)/, /expect\s+to/],
    keywords: ['predict', 'forecast', 'projection', 'next quarter', 'next month', 'will happen', 'future', 'outlook'],
  },
  {
    intent: 'simulate',
    patterns: [/what\s+if/, /what\s+happens\s+if/, /scenario\s+where/, /imagine/, /hypothetically/],
    keywords: ['what if', 'simulate', 'scenario', 'hypothetical', 'model what', 'stress test'],
  },
  {
    intent: 'diagnose',
    patterns: [/why\s+is\s+\w+\s+(declining|dropping|falling|decreasing)/, /root\s+cause/, /what\s+went\s+wrong/],
    keywords: ['diagnose', 'root cause', 'wrong', 'declining', 'dropping', 'problem', 'issue', 'debug', 'investigate'],
  },
  {
    intent: 'build',
    patterns: [/build\s+(a|me|the)\s+\w+\s+model/, /create\s+(a|the)\s+\w+\s+forecast/, /comprehensive\s+analysis/],
    keywords: ['build', 'create model', 'construct', 'full analysis', 'comprehensive', 'deep dive'],
  },
  {
    intent: 'explain',
    patterns: [/explain\s+(why|how|what)/, /how\s+does\s+\w+\s+(work|affect|impact)/, /tell\s+me\s+about/],
    keywords: ['explain', 'how does', 'what is', 'describe', 'walk me through', 'help me understand'],
  },
  {
    intent: 'compare',
    patterns: [/compare\s+\w+\s+(to|with|vs|versus)/, /difference\s+between/, /\w+\s+vs\s+\w+/],
    keywords: ['compare', 'versus', 'vs', 'difference between', 'benchmark against', 'relative to'],
  },
  {
    intent: 'monitor',
    patterns: [/how\s+(is|are)\s+\w+\s+(doing|performing)/, /current\s+status/, /health\s+check/],
    keywords: ['status', 'health', 'performing', 'dashboard', 'metrics now', 'current state'],
  },
  {
    intent: 'optimize',
    patterns: [/how\s+(can|do)\s+(we|i)\s+(improve|optimize|increase|reduce)/, /best\s+way\s+to\s+(improve|grow)/],
    keywords: ['optimize', 'improve', 'increase', 'reduce', 'minimize', 'maximize', 'best way to'],
  },
  {
    intent: 'recommend',
    patterns: [/what\s+should\s+(we|i)\s+(do|focus)/, /recommend/, /suggest\s+\w+\s+action/],
    keywords: ['recommend', 'suggest', 'should we', 'advise', 'next steps', 'action plan'],
  },
  {
    intent: 'audit',
    patterns: [/audit\s+\w+/, /compliance\s+check/, /risk\s+assessment/],
    keywords: ['audit', 'compliance', 'risk', 'review', 'validate', 'verify'],
  },
  {
    intent: 'lookup',
    patterns: [/^what\s+is\s+(our|the)\s+\w+\??$/, /^how\s+many/, /^show\s+me/],
    keywords: ['what is our', 'how many', 'show me', 'list', 'current value'],
  },
];

// ============================================================================
// COMPLEXITY SIGNALS
// ============================================================================

const TEMPORAL_SIGNALS = ['over time', 'trend', 'monthly', 'quarterly', 'weekly', 'daily', 'year-over-year', 'yoy', 'mom', 'qoq', 'last quarter', 'since', 'historical'];
const CAUSAL_SIGNALS = ['because', 'causes', 'drives', 'affects', 'impacts', 'leads to', 'correlate', 'root cause', 'upstream', 'downstream', 'cascade'];
const COUNTERFACTUAL_SIGNALS = ['what if', 'suppose', 'imagine', 'hypothetically', 'scenario', 'alternative', 'instead'];
const MULTI_STEP_SIGNALS = ['and then', 'step by step', 'plan', 'playbook', 'end to end', 'comprehensive', 'full analysis', 'deep dive'];
const METRIC_PATTERNS = /\b(arr|mrr|nrr|cac|ltv|dau|mau|nps|csat|enps|churn|retention|burn rate|runway|margin|conversion|velocity|lead time)\b/i;

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a Dispatch Assessor — the brain's routing decision engine.
 *
 * Pure function. No I/O. Sub-1ms latency.
 *
 * @example
 * ```typescript
 * const assessor = createDispatchAssessor();
 * const assessment = assessor.assess("What if we increase marketing spend by 20%?");
 * // → { route: 'action_domain', intent: 'simulate', domains: ['marketing', 'finance'], ... }
 * ```
 */
export function createDispatchAssessor() {

  function assess(question: string, context?: { userRole?: string; hasConnectedData?: boolean }): DispatchAssessment {
    const start = performance.now();
    const lower = question.toLowerCase().trim();

    // 1. Detect intent
    const intent = detectIntent(lower);

    // 2. Detect domains
    const domains = detectDomains(lower);

    // 3. Compute complexity factors
    const complexityFactors = computeComplexityFactors(lower, domains, intent);

    // 4. Compute complexity score (0-1)
    const complexityScore = computeComplexityScore(complexityFactors);

    // 5. Determine required capabilities
    const requiredCapabilities = determineCapabilities(intent, complexityFactors);

    // 6. Route decision
    const route = determineRoute(complexityScore, intent, complexityFactors);

    // 7. Determine if LLM and action artifacts are needed
    const needsLLM = route !== 'fast_query';
    const needsAction = ['predict', 'simulate', 'diagnose', 'build', 'optimize', 'compare'].includes(intent);

    const latencyMs = performance.now() - start;

    return {
      route,
      intent,
      domains: domains as BusinessDomain[],
      primaryDomain: (domains[0] || 'finance') as BusinessDomain,
      complexityScore,
      complexityFactors,
      requiredCapabilities,
      needsLLM,
      needsAction,
      confidence: computeConfidence(intent, domains, complexityFactors),
      latencyMs,
    };
  }

  // ── Intent Detection ────────────────────────────────────────────────────

  function detectIntent(lower: string): UserIntent {
    let bestIntent: UserIntent = 'general';
    let bestScore = 0;

    for (const pattern of INTENT_PATTERNS) {
      let score = 0;

      // Check regex patterns (high weight)
      for (const regex of pattern.patterns) {
        if (regex.test(lower)) {
          score += 3;
        }
      }

      // Check keywords (lower weight)
      for (const keyword of pattern.keywords) {
        if (lower.includes(keyword)) {
          score += 1;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestIntent = pattern.intent;
      }
    }

    return bestIntent;
  }

  // ── Domain Detection ────────────────────────────────────────────────────

  function detectDomains(lower: string): string[] {
    const domainScores: Record<string, number> = {};

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          score += kw.includes(' ') ? 2 : 1; // Multi-word matches count more
        }
      }
      if (score > 0) {
        domainScores[domain] = score;
      }
    }

    // Sort by score descending
    const sorted = Object.entries(domainScores)
      .sort((a, b) => b[1] - a[1])
      .map(([domain]) => domain);

    // Default to finance + strategy if nothing detected
    return sorted.length > 0 ? sorted : ['finance', 'strategy'];
  }

  // ── Complexity Computation ──────────────────────────────────────────────

  function computeComplexityFactors(
    lower: string,
    domains: string[],
    intent: UserIntent
  ): ComplexityFactors {
    const requiresTemporal = TEMPORAL_SIGNALS.some(s => lower.includes(s));
    const requiresCausal = CAUSAL_SIGNALS.some(s => lower.includes(s));
    const requiresCounterfactual = COUNTERFACTUAL_SIGNALS.some(s => lower.includes(s));
    const requiresMultiStep = MULTI_STEP_SIGNALS.some(s => lower.includes(s));
    const hasSpecificMetrics = METRIC_PATTERNS.test(lower);
    const isComparison = /\bvs\b|\bversus\b|\bcompare\b|\bdifference\b/i.test(lower);

    // Estimate token complexity based on question length and complexity
    const baseTokens = lower.split(/\s+/).length * 50; // Rough output estimate
    const multiplier = 1 + (domains.length * 0.3) + (requiresTemporal ? 0.5 : 0) + (requiresCounterfactual ? 0.8 : 0);
    const estimatedTokens = Math.round(baseTokens * multiplier);

    return {
      domainCount: domains.length,
      requiresTemporal,
      requiresCausal,
      requiresCounterfactual,
      requiresMultiStep,
      hasSpecificMetrics,
      isComparison,
      estimatedTokens,
    };
  }

  function computeComplexityScore(factors: ComplexityFactors): number {
    let score = 0;

    // Domain complexity: each additional domain adds complexity
    score += Math.min(factors.domainCount * 0.12, 0.36);

    // Capability requirements
    if (factors.requiresTemporal) score += 0.15;
    if (factors.requiresCausal) score += 0.15;
    if (factors.requiresCounterfactual) score += 0.2;
    if (factors.requiresMultiStep) score += 0.2;
    if (factors.isComparison) score += 0.1;
    if (factors.hasSpecificMetrics) score += 0.05;

    return Math.min(score, 1.0);
  }

  // ── Capability Determination ────────────────────────────────────────────

  function determineCapabilities(intent: UserIntent, factors: ComplexityFactors): string[] {
    const caps: string[] = [];

    // Base capabilities by intent
    switch (intent) {
      case 'predict':
      case 'build':
        caps.push('temporalForecaster', 'timeSeries', 'causalDAG');
        break;
      case 'simulate':
        caps.push('whatIfSimulator', 'causalDAG', 'timeSeries');
        break;
      case 'diagnose':
        caps.push('anomalyDetector', 'causalDAG', 'contextAwareReasoner');
        break;
      case 'explain':
        caps.push('explanationGenerator', 'causalDAG');
        break;
      case 'compare':
        caps.push('timeSeries', 'causalDAG', 'contextAwareReasoner');
        break;
      case 'optimize':
        caps.push('causalDAG', 'temporalForecaster', 'contextAwareReasoner');
        break;
      case 'recommend':
        caps.push('contextAwareReasoner', 'causalDAG', 'motorCommands');
        break;
      case 'audit':
        caps.push('rules', 'patterns', 'contextAwareReasoner');
        break;
      case 'monitor':
      case 'lookup':
        caps.push('patterns', 'rules');
        break;
      case 'general':
        caps.push('llmAmplifier');
        break;
    }

    // Additional capabilities from complexity factors
    if (factors.requiresTemporal && !caps.includes('timeSeries')) caps.push('timeSeries');
    if (factors.requiresCausal && !caps.includes('causalDAG')) caps.push('causalDAG');
    if (factors.requiresCounterfactual && !caps.includes('whatIfSimulator')) caps.push('whatIfSimulator');
    if (factors.requiresMultiStep && !caps.includes('motorCommands')) caps.push('motorCommands');
    if (factors.domainCount >= 3) caps.push('cascades');

    // Always need LLM for natural language output
    if (!caps.includes('llmAmplifier')) caps.push('llmAmplifier');

    return [...new Set(caps)];
  }

  // ── Route Determination ─────────────────────────────────────────────────

  function determineRoute(
    complexityScore: number,
    intent: UserIntent,
    factors: ComplexityFactors
  ): DispatchRoute {
    // Fast query: simple lookups, status checks, conversational
    if (complexityScore < 0.15 && ['lookup', 'monitor', 'general'].includes(intent)) {
      return 'fast_query';
    }

    // Agent orchestration: high complexity, multi-domain, multi-step
    if (
      complexityScore >= 0.6 ||
      factors.requiresMultiStep ||
      (factors.domainCount >= 3 && factors.requiresCausal) ||
      intent === 'build'
    ) {
      return 'agent_orchestration';
    }

    // Default: action domain (single-domain computation)
    return 'action_domain';
  }

  // ── Confidence Computation ──────────────────────────────────────────────

  function computeConfidence(
    intent: UserIntent,
    domains: string[],
    factors: ComplexityFactors
  ): number {
    let confidence = 0.7; // Base

    // Higher confidence when intent is clear
    if (intent !== 'general') confidence += 0.15;

    // Higher confidence when domains are detected
    if (domains.length > 0 && domains[0] !== 'finance') confidence += 0.1;

    // Lower confidence for very complex queries
    if (factors.requiresCounterfactual && factors.requiresMultiStep) confidence -= 0.1;

    // Lower confidence for ambiguous multi-domain queries
    if (factors.domainCount > 4) confidence -= 0.15;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  // ── Public API ──────────────────────────────────────────────────────────

  return {
    /**
     * Assess a question and determine how to dispatch it.
     * Pure function. No I/O. Sub-1ms latency.
     */
    assess,

    /**
     * Quick check: is this a fast query?
     */
    isFastQuery(question: string): boolean {
      return assess(question).route === 'fast_query';
    },

    /**
     * Quick check: does this need the action engine?
     */
    needsAction(question: string): boolean {
      return assess(question).needsAction;
    },
  };
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type DispatchAssessorInstance = ReturnType<typeof createDispatchAssessor>;
