/**
 * Brain Model Router — Difficulty-Aware Adaptive Orchestration (DAAO)
 * =====================================================================
 *
 * Routes each Copilot query to the cheapest model that can handle it.
 * Target: ~84% cost reduction by routing ~80% of traffic to Haiku.
 *
 * 3-Tier Routing:
 *   Haiku  (~80% of traffic) — simple, single-fact, follow-up, empty brain
 *   Sonnet (~18% of traffic) — domain data present, multi-step, moderate length
 *   Opus   (~2%  of traffic) — long cross-system debugging, high-IQ complex queries
 *
 * This router is ADDITIVE to the existing se-aas/model-router.ts (domain routing).
 * It handles the Copilot chat path specifically, where the query text is the
 * primary signal rather than the domain type.
 */

export type CopilotModel =
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-6';

export interface ModelSelectionContext {
  /** Whether any domain data was retrieved (delivery intel, pod match, etc.) */
  hasDomainData: boolean;
  /** How many distinct domains returned data */
  domainCount: number;
  /** Whether this is a follow-up message in an ongoing conversation */
  isFollowUp: boolean;
  /** Brain IQ score (0–100) — higher = richer context available */
  brainIq: number;
}

export interface ModelSelectionResult {
  model: CopilotModel;
  rationale: string;
  tier: 'haiku' | 'sonnet' | 'opus';
}

// ── Regex patterns for routing classification ─────────────────────────────────

/** Simple factual question starters — Haiku handles these well */
const SIMPLE_FACTUAL_PREFIXES = /^\s*(what is|what's|who is|who's|when (is|was|will)|how many|how much|where is|where's|list|show me|give me)\b/i;

/** Cross-system debugging keywords — escalate to Opus */
const OPUS_KEYWORDS = /\b(why is|why (isn't|is not|won't|will not|doesn't|does not|can't|cannot)|root cause|debug|not working|broken|failing|investigate|trace the|what's causing|why (does|did)|unexpected behavior|production (issue|error|problem))\b/i;

/**
 * Select the optimal Claude model for a Copilot query.
 *
 * Decision order (first match wins):
 *   1. Opus  — long query (>200 chars) with multiple clauses, OR debugging keywords, OR high-IQ complex domain
 *   2. Haiku — short query (<50 chars) with no domain data
 *   3. Haiku — follow-up with no new domain data
 *   4. Haiku — simple factual question pattern
 *   5. Haiku — low brain IQ and no domain data (not enough context anyway)
 *   6. Sonnet — has domain data (delivery intelligence, pod match, etc.)
 *   7. Sonnet — multi-step question (contains "and", "also", "additionally")
 *   8. Sonnet — moderate length query (50–200 chars)
 *   9. Sonnet — default fallback
 */
export function selectModel(
  query: string,
  context: ModelSelectionContext
): ModelSelectionResult {
  const len = query.trim().length;
  const { hasDomainData, domainCount, isFollowUp, brainIq } = context;

  // ── OPUS tier (expert-only, ~2% of traffic) ──────────────────────────────

  // Long cross-system query with debugging intent
  if (len > 200 && OPUS_KEYWORDS.test(query)) {
    return {
      model: 'claude-opus-4-6',
      tier: 'opus',
      rationale: `Long debugging query (${len} chars) with cross-system investigation keywords — Opus for deep root-cause analysis`,
    };
  }

  // High-IQ brain + complex domain query with multiple clauses
  if (brainIq > 70 && hasDomainData && domainCount >= 2) {
    return {
      model: 'claude-opus-4-6',
      tier: 'opus',
      rationale: `Brain IQ ${brainIq} > 70 with ${domainCount} active domains — Opus for high-fidelity synthesis`,
    };
  }

  // ── HAIKU tier (cheap, fast, ~80% of traffic) ─────────────────────────────

  // Short query with no domain data — Haiku is sufficient
  if (len < 50 && !hasDomainData) {
    return {
      model: 'claude-haiku-4-5-20251001',
      tier: 'haiku',
      rationale: `Short query (${len} chars) with no domain data — Haiku is fast and sufficient`,
    };
  }

  // Follow-up with no new domain data — context is already established
  if (isFollowUp && !hasDomainData) {
    return {
      model: 'claude-haiku-4-5-20251001',
      tier: 'haiku',
      rationale: `Follow-up message with no domain data — prior context established, Haiku maintains coherence cheaply`,
    };
  }

  // Simple factual question pattern (what is, who is, when, how many, etc.)
  if (SIMPLE_FACTUAL_PREFIXES.test(query)) {
    return {
      model: 'claude-haiku-4-5-20251001',
      tier: 'haiku',
      rationale: `Factual question pattern detected — Haiku handles single-fact lookups efficiently`,
    };
  }

  // Brain not ready (IQ < 30) with no domain data — not enough context for complex answer
  if (brainIq < 30 && !hasDomainData) {
    return {
      model: 'claude-haiku-4-5-20251001',
      tier: 'haiku',
      rationale: `Brain IQ ${brainIq} < 30 and no domain data — insufficient context for quality Sonnet response, Haiku is cost-appropriate`,
    };
  }

  // ── SONNET tier (standard, ~18% of traffic) ───────────────────────────────

  // Has domain data — needs synthesis capability
  if (hasDomainData) {
    return {
      model: 'claude-sonnet-4-6',
      tier: 'sonnet',
      rationale: `Domain data present (${domainCount} domain(s)) — Sonnet for structured analysis and synthesis`,
    };
  }

  // Multi-step question — requires chained reasoning
  if (/\b(and|also|additionally|furthermore|as well as)\b/i.test(query)) {
    return {
      model: 'claude-sonnet-4-6',
      tier: 'sonnet',
      rationale: `Multi-step question with conjunctions — Sonnet for chained reasoning`,
    };
  }

  // Moderate-length query
  if (len >= 50 && len <= 200) {
    return {
      model: 'claude-sonnet-4-6',
      tier: 'sonnet',
      rationale: `Moderate-length query (${len} chars) — Sonnet for quality response`,
    };
  }

  // Default fallback — Sonnet (safe for unknown patterns)
  return {
    model: 'claude-sonnet-4-6',
    tier: 'sonnet',
    rationale: `Default routing — Sonnet for reliable quality on unclassified query pattern`,
  };
}

// ── DAAO: Difficulty Classification ──────────────────────────────────────────
//
// Classifies a query into 4 difficulty tiers based on linguistic signals.
// Used as an additive signal to selectModel() for upstream routing decisions.
//
// trivial  → Haiku  (single-fact lookups, status checks, <50 chars)
// standard → Haiku  (most conversational queries — Haiku handles 80%+ traffic)
// complex  → Sonnet (multi-step analysis, recommendations, optimization)
// expert   → Opus   (cross-system root cause, 3+ domain correlation, long queries)
//
// Research: DAAO with difficulty classification achieves ~84% cost reduction
// vs. always-Sonnet baseline with +11% quality on complex/expert tiers.

export type DifficultyLevel = 'trivial' | 'standard' | 'complex' | 'expert';

export interface DifficultyContext {
  /** Domain type being executed (e.g. 'pod-match', 'early-warning') */
  domainType?: string;
  /** Whether connector data is available for this query */
  hasConnectorData?: boolean;
  /** Number of prior conversation turns (longer history = higher complexity) */
  historyLength?: number;
}

/**
 * Classify a query into a difficulty tier.
 *
 * Rules (first match wins):
 *   trivial  — very short (<50 chars) OR matches simple factual question patterns
 *   expert   — 2+ cross-domain keywords OR query >500 chars OR history >20 turns
 *   complex  — analysis/recommendation/optimization keywords
 *   standard — everything else (Haiku default)
 */
export function classifyQueryDifficulty(
  query: string,
  context: DifficultyContext = {}
): DifficultyLevel {
  const q = query.toLowerCase().trim();
  const len = q.length;
  const { historyLength = 0 } = context;

  // trivial: very short, or obvious single-fact lookup
  if (len < 50 || /^(what is|show me|list|how many|status of)\b/i.test(q)) {
    return 'trivial';
  }

  // expert: cross-domain reasoning signals (2+ triggers required)
  const expertIndicators = ['why', 'root cause', 'correlat', 'pattern across', 'compare', 'investigate', 'debug', 'trace', 'diagnose'];
  const expertHitCount = expertIndicators.filter(kw => q.includes(kw)).length;
  if (expertHitCount >= 2 || len > 500 || historyLength > 20) {
    return 'expert';
  }

  // complex: analytical or strategic queries
  if (/analyz|recommend|should we|best approach|optim|strateg|architect|decision|tradeoff|trade-off/i.test(q)) {
    return 'complex';
  }

  return 'standard';
}

/**
 * Map a difficulty level to the cheapest Claude model that can handle it.
 *
 * trivial  → Haiku  (fast lookup, no synthesis needed)
 * standard → Haiku  (most queries — default to cheap)
 * complex  → Sonnet (structured analysis, recommendations)
 * expert   → Opus   (cross-system root cause, deep synthesis)
 */
export function selectModelForDifficulty(difficulty: DifficultyLevel): CopilotModel {
  const mapping: Record<DifficultyLevel, CopilotModel> = {
    trivial:  'claude-haiku-4-5-20251001',
    standard: 'claude-haiku-4-5-20251001', // Haiku handles the vast majority of queries
    complex:  'claude-sonnet-4-6',
    expert:   'claude-opus-4-6',
  };
  return mapping[difficulty];
}
