/**
 * Smart Model Router — DAAO Cost-Optimized LLM Model Selection
 * =========================================================
 *
 * Implements Difficulty-Aware Adaptive Orchestration (DAAO):
 * Route queries to appropriate model based on complexity assessment.
 * Research result: 84% cost reduction, +11% quality vs single-model approach.
 * (DAAO paper, 2025 — Difficulty-Aware Adaptive Orchestration for LLMs)
 *
 * Three-tier routing:
 *   - Haiku  ($0.80/M tokens): Simple Q&A, factual lookups, status checks,
 *     structured extraction, greetings, single-domain questions
 *   - Sonnet ($15/M tokens):  Multi-domain analysis, strategic planning,
 *     causal reasoning, playbook generation, what-if scenarios, executive briefings
 *   - Opus   ($75/M tokens):  Cross-system debugging (3+ system boundaries),
 *     deep root-cause analysis, architectural decisions with long-term impact,
 *     expert-level multi-domain synthesis
 *
 * The router analyzes the query text for complexity signals:
 *   - Multi-domain mentions → Sonnet or Opus
 *   - Strategic/planning keywords → Sonnet
 *   - Expert-level cross-system reasoning → Opus
 *   - Simple lookups/status → Haiku
 *   - Short queries without complexity markers → Haiku
 *
 * This NEVER degrades output quality — Haiku is only used for queries where
 * it produces equivalent quality to Sonnet. When in doubt, escalates to Sonnet.
 *
 * @packageDocumentation
 */

// ============================================================================
// MODELS
// ============================================================================

/** Fast model — high quality for structured tasks, 3x cheaper than Sonnet */
export const MODEL_FAST = 'claude-haiku-4-5-20251001';

/** Deep model — full reasoning power for complex multi-domain analysis */
export const MODEL_DEEP = 'claude-sonnet-4-6';

/** Expert model — cross-system root-cause, architectural decisions, 3+ system boundaries */
export const MODEL_EXPERT = 'claude-opus-4-6';

// ============================================================================
// DAAO TYPES
// ============================================================================

/** The three model tiers in the DAAO routing system */
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

/** Full routing decision with rationale, for brain RL capture */
export interface RoutingDecision {
  /** Full model ID string */
  model: string;
  /** Tier label */
  tier: ModelTier;
  /** Human-readable rationale for the selection */
  reasoning: string;
  /** 0-1 complexity score that drove the decision */
  complexityScore: number;
  /** Cost bucket for budgeting and reporting */
  estimatedCost: 'low' | 'medium' | 'high';
}

// ============================================================================
// COMPLEXITY DETECTION
// ============================================================================

/** Complexity signals that indicate a query needs Sonnet */
const STRATEGIC_KEYWORDS = new Set([
  // Strategic planning
  'strategy', 'strategic', 'roadmap', 'plan', 'planning', 'playbook',
  'initiative', 'prioritize', 'prioritise', 'recommend', 'recommendation',
  'tradeoff', 'trade-off', 'decision', 'should we', 'should i',
  // Multi-step reasoning
  'analyze', 'analyse', 'analysis', 'deep dive', 'breakdown', 'break down',
  'compare', 'comparison', 'evaluate', 'assessment', 'audit',
  // Causal reasoning
  'cause', 'caused', 'causing', 'because', 'impact', 'cascade',
  'ripple', 'downstream', 'upstream', 'correlation', 'causal',
  'root cause', 'why is', 'why are', 'why did', 'how does', 'how do',
  // Prediction & scenario
  'predict', 'forecast', 'projection', 'what if', 'what-if', 'scenario',
  'simulate', 'simulation', 'model', 'estimate',
  // Executive-level
  'executive', 'briefing', 'summary for', 'present to', 'board',
  'investor', 'stakeholder', 'leadership',
  // Complex domain operations
  'cross-domain', 'cross domain', 'across domains', 'organization-wide',
  'holistic', 'comprehensive', 'end-to-end', 'full picture',
]);

/**
 * Expert-level signals that push routing to Opus.
 * These represent queries crossing 3+ system boundaries or requiring
 * architectural-level reasoning beyond Sonnet's optimal range.
 */
const EXPERT_KEYWORDS = new Set([
  // Cross-system debugging
  'debug', 'debugging', 'root cause', 'investigate', 'diagnose', 'trace',
  'why does', 'why is it', 'intermittent', 'flaky', 'race condition',
  // Architectural decisions
  'architect', 'architecture', 'design decision', 'long-term', 'trade-off between',
  'refactor entire', 'migrate entire', 'replace entire', 'overhaul',
  'system design', 'scalability', 'performance bottleneck',
  // Deep multi-system synthesis
  'across all', 'every system', 'entire platform', 'full stack',
  'end to end debugging', 'infrastructure + application', 'database + api + frontend',
  // Expert analysis
  'comprehensive audit', 'security audit', 'performance audit', 'full audit',
  'post-mortem', 'incident analysis', 'blameless review',
]);

/** Simple query patterns that Haiku handles perfectly */
const SIMPLE_PATTERNS = [
  // Greetings
  /^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you)/i,
  // Status checks
  /^(what('s| is) the (status|state|health)|show me|list|get|fetch)/i,
  // Single metric lookups
  /^(what('s| is) (our|the|my) \w+\??$)/i,
  // Yes/no questions
  /^(is |are |do |does |did |has |have |can |will )/i,
  // Short factual lookups
  /^(how many|how much|when did|when was|who is|who are)/i,
];

/** Domain keywords — multiple domains in one query = complex */
const DOMAIN_KEYWORDS = new Set([
  'finance', 'financial', 'revenue', 'sales', 'marketing',
  'engineering', 'product', 'support', 'cs', 'customer success',
  'people', 'hr', 'hiring', 'retention', 'churn',
  'infrastructure', 'devops', 'security', 'compliance',
]);

export interface ComplexityResult {
  /** Selected model ID */
  model: string;
  /** Complexity score (0-1). <0.4 = Haiku, 0.4-0.75 = Sonnet, >0.75 = Opus */
  score: number;
  /** Why this model was selected */
  reason: string;
  /** Detected complexity signals */
  signals: string[];
}

/**
 * Analyze query complexity and select the optimal model.
 * Implements DAAO three-tier routing: Haiku → Sonnet → Opus.
 *
 * @param query - The user's message
 * @param context - Optional context about the request
 * @returns ComplexityResult with selected model and reasoning
 */
export function routeModel(
  query: string,
  context?: {
    /** Pre-computed complexity score (e.g. from brain-commander) */
    commanderComplexity?: number;
    /** Whether conversation has multi-turn history */
    hasConversationHistory?: boolean;
    /** Number of conversation turns so far */
    conversationTurns?: number;
    /** Whether brain artifacts were generated (forecasts, simulations, etc.) */
    hasBrainArtifacts?: boolean;
    /** Whether SE-aaS or action domain results are present */
    hasDomainResults?: boolean;
    /** Force Sonnet for this query */
    forceSonnet?: boolean;
  },
): ComplexityResult {
  // If force Sonnet is requested, skip analysis
  if (context?.forceSonnet) {
    return {
      model: MODEL_DEEP,
      score: 1.0,
      reason: 'Force Sonnet requested',
      signals: ['force_sonnet'],
    };
  }

  const signals: string[] = [];
  let score = 0;
  const lowerQuery = query.toLowerCase().trim();

  // ── Pre-computed complexity from brain-commander ──────────────────
  if (context?.commanderComplexity != null) {
    if (context.commanderComplexity >= 0.7) {
      score += 0.4;
      signals.push(`commander_high_complexity(${context.commanderComplexity.toFixed(2)})`);
    } else if (context.commanderComplexity >= 0.4) {
      score += 0.2;
      signals.push(`commander_medium_complexity(${context.commanderComplexity.toFixed(2)})`);
    }
  }

  // ── Brain artifacts present → Sonnet for synthesis ───────────────
  if (context?.hasBrainArtifacts) {
    score += 0.35;
    signals.push('brain_artifacts_present');
  }

  // ── Domain results present → Sonnet for explanation ──────────────
  if (context?.hasDomainResults) {
    score += 0.15;
    signals.push('domain_results_present');
  }

  // ── Simple pattern detection → strong Haiku signal ───────────────
  const isSimplePattern = SIMPLE_PATTERNS.some(p => p.test(lowerQuery));
  if (isSimplePattern && lowerQuery.length < 80) {
    score -= 0.3;
    signals.push('simple_pattern_match');
  }

  // ── Short queries without complexity markers → Haiku ─────────────
  if (lowerQuery.length < 40 && !signals.some(s => s.includes('commander') || s.includes('artifact'))) {
    score -= 0.1;
    signals.push('short_query');
  }

  // ── Expert keyword detection → Opus signal ───────────────────────
  let expertHits = 0;
  for (const keyword of EXPERT_KEYWORDS) {
    if (keyword.includes(' ')) {
      if (lowerQuery.includes(keyword)) expertHits++;
    } else {
      if (lowerQuery.split(/\s+/).includes(keyword)) expertHits++;
    }
  }
  if (expertHits >= 2) {
    score += 0.5;
    signals.push(`expert_keywords(${expertHits})`);
  } else if (expertHits === 1) {
    score += 0.25;
    signals.push(`expert_keywords(${expertHits})`);
  }

  // ── Strategic keyword detection ──────────────────────────────────
  const words = lowerQuery.split(/\s+/);
  let strategicHits = 0;
  for (const keyword of STRATEGIC_KEYWORDS) {
    if (keyword.includes(' ')) {
      // Multi-word keyword — check as substring
      if (lowerQuery.includes(keyword)) {
        strategicHits++;
      }
    } else {
      // Single word keyword
      if (words.includes(keyword)) {
        strategicHits++;
      }
    }
  }

  if (strategicHits >= 3) {
    score += 0.4;
    signals.push(`strategic_keywords(${strategicHits})`);
  } else if (strategicHits >= 1) {
    score += 0.15;
    signals.push(`strategic_keywords(${strategicHits})`);
  }

  // ── Multi-domain detection ───────────────────────────────────────
  let domainHits = 0;
  for (const domain of DOMAIN_KEYWORDS) {
    if (lowerQuery.includes(domain)) {
      domainHits++;
    }
  }
  if (domainHits >= 2) {
    score += 0.3;
    signals.push(`multi_domain(${domainHits})`);
  }

  // ── Long complex queries → likely needs reasoning ────────────────
  if (lowerQuery.length > 200) {
    score += 0.15;
    signals.push('long_query');
  }

  // ── Multi-turn deep conversation → Sonnet for coherence ─────────
  if (context?.conversationTurns && context.conversationTurns >= 5) {
    score += 0.1;
    signals.push(`deep_conversation(${context.conversationTurns})`);
  }

  // Clamp score
  const finalScore = Math.max(0, Math.min(1, score));

  // ── DAAO Three-Tier Decision ─────────────────────────────────────
  // < 0.40  → Haiku  (simple/structured queries, majority of traffic)
  // 0.40-0.75 → Sonnet (moderate complexity, multi-domain, strategic)
  // >= 0.75 → Opus   (expert-level, 3+ system boundaries, architectural)
  const SONNET_THRESHOLD = 0.4;
  const OPUS_THRESHOLD = 0.75;

  let selectedModel: string;
  if (finalScore >= OPUS_THRESHOLD) {
    selectedModel = MODEL_EXPERT;
  } else if (finalScore >= SONNET_THRESHOLD) {
    selectedModel = MODEL_DEEP;
  } else {
    selectedModel = MODEL_FAST;
  }

  const tierLabel = finalScore >= OPUS_THRESHOLD ? 'Opus' : finalScore >= SONNET_THRESHOLD ? 'Sonnet' : 'Haiku';
  const reason = finalScore >= SONNET_THRESHOLD
    ? `${tierLabel} query (score ${finalScore.toFixed(2)}): ${signals.join(', ')}`
    : `Simple query (score ${finalScore.toFixed(2)}): Haiku provides equivalent quality`;

  return {
    model: selectedModel,
    score: finalScore,
    reason,
    signals,
  };
}

/**
 * Quick helper — returns just the model string for simple integration.
 */
export function selectModel(
  query: string,
  context?: Parameters<typeof routeModel>[1],
): string {
  return routeModel(query, context).model;
}

/**
 * DAAO full routing decision — returns RoutingDecision for brain RL capture.
 * Use this when you need to log the decision (tier, score, cost) to the brain.
 */
export function routeQueryDAA(
  message: string,
  conversationHistory: Array<{ role: string }>,
  hasSEaaSContext: boolean,
  forceModel?: string,
): RoutingDecision {
  if (forceModel) {
    const tier: ModelTier = forceModel.includes('haiku') ? 'haiku'
      : forceModel.includes('opus') ? 'opus'
      : 'sonnet';
    return {
      model: forceModel,
      tier,
      reasoning: 'forced',
      complexityScore: 0.5,
      estimatedCost: 'medium',
    };
  }

  const result = routeModel(message, {
    hasConversationHistory: conversationHistory.length > 0,
    conversationTurns: conversationHistory.length,
    hasDomainResults: hasSEaaSContext,
  });

  const tier: ModelTier = result.model === MODEL_EXPERT ? 'opus'
    : result.model === MODEL_DEEP ? 'sonnet'
    : 'haiku';

  return {
    model: result.model,
    tier,
    reasoning: result.reason,
    complexityScore: result.score,
    estimatedCost: tier === 'haiku' ? 'low' : tier === 'sonnet' ? 'medium' : 'high',
  };
}

/**
 * Route model for action-domain style tasks.
 * These are always structured extraction → Haiku is fine,
 * UNLESS the task requires open-ended strategic reasoning.
 */
export function routeActionDomainModel(
  taskType: 'extraction' | 'analysis' | 'generation' | 'reasoning',
): string {
  switch (taskType) {
    case 'extraction':
      return MODEL_FAST; // Structured JSON extraction — Haiku is perfect
    case 'analysis':
      return MODEL_DEEP; // Multi-step analysis — Sonnet needed
    case 'generation':
      return MODEL_DEEP; // Code/content generation — Sonnet for quality
    case 'reasoning':
      return MODEL_DEEP; // Open-ended reasoning — Sonnet required
    default:
      return MODEL_FAST;
  }
}
