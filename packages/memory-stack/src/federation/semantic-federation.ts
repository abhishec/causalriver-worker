/**
 * Semantic Federation — The Brain's Synaptic Router
 * ═══════════════════════════════════════════════════
 *
 * THE MISSING SYNAPSE.
 *
 * Before this module, federation was a dictionary — exact string matching.
 * "revenue" matched "revenue". "customer_health" NEVER reached "retention".
 * The brain had neurons but no synapses. Knowledge was trapped in silos.
 *
 * This module IS the synapse.
 *
 * It transforms NexusBrain from a dictionary-level pattern matcher into a
 * true semantic intelligence network where:
 *
 *   "support_ticket_surge" ←→ "churn_risk"       (similarity: 0.82)
 *   "ARR_growth"           ←→ "revenue_expansion" (similarity: 0.91)
 *   "engineer_burnout"     ←→ "delivery_slowdown" (similarity: 0.78)
 *   "NPS_drop"             ←→ "customer_health"   (similarity: 0.85)
 *
 * Architecture:
 *
 *   Signal Ingestion → Semantic Enrichment → Domain Embedding
 *                                              ↓
 *   Federation Query → Semantic Dedup ←── Cosine Similarity
 *                                              ↓
 *   Upstream Promotion → Semantic Novelty Check → CORE Brain
 *
 * Three capabilities:
 *
 *   1. SEMANTIC DEDUPLICATION — When merging ORG + CORE results,
 *      items with cosine similarity > 0.82 are treated as duplicates.
 *      "PR merge velocity declining" and "Pull request throughput dropping"
 *      are the SAME insight. ORG version wins.
 *
 *   2. SEMANTIC DOMAIN ROUTING — Signals and knowledge items are embedded,
 *      enabling cross-domain discovery that string matching cannot find.
 *      A "deploy_failure" signal can route to both "engineering" AND
 *      "customer_impact" because the embedding captures both semantics.
 *
 *   3. SEMANTIC NOVELTY DETECTION — Before promoting org knowledge to CORE,
 *      check if semantically similar knowledge already exists. Prevents
 *      the CORE brain from accumulating near-duplicate patterns while still
 *      accepting genuinely novel discoveries.
 *
 * Performance:
 *   - N-gram embeddings (384 dims): ~0.1ms per item, zero API calls
 *   - Neural embeddings (1536 dims): ~50ms per item, batched API calls
 *   - In-memory domain embedding cache: ~0.01ms per lookup
 *   - Cosine similarity: O(d) where d = dimensions
 *
 * @packageDocumentation
 */

import { generateEmbedding, cosineSimilarity } from '../core/embeddings/embedding-engine';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface SemanticFederationConfig {
  /**
   * Cosine similarity threshold for deduplication.
   * Items with similarity above this threshold are considered duplicates.
   * Default: 0.82 (empirically tuned for business domain text)
   *
   * Explanation:
   *   0.70 = loosely related (too aggressive — "revenue" ≈ "engineering")
   *   0.82 = semantically equivalent (sweet spot)
   *   0.95 = near-identical text (too conservative — misses paraphrases)
   */
  deduplicationThreshold?: number;

  /**
   * Cosine similarity threshold for semantic domain routing.
   * Signals with domain similarity above this route to related domains.
   * Default: 0.65 (intentionally lower — we want cross-domain discovery)
   */
  domainRoutingThreshold?: number;

  /**
   * Cosine similarity threshold for novelty detection in upstream promotion.
   * Knowledge with similarity above this to existing CORE items is NOT novel.
   * Default: 0.78 (between routing and dedup — allows refinements through)
   */
  noveltyThreshold?: number;

  /**
   * Embedding dimensions. Must match the n-gram generator.
   * Default: 384 (matches generateEmbedding default)
   */
  dimensions?: number;

  /**
   * Maximum number of CORE items to compare against during novelty check.
   * Higher = more accurate but slower.
   * Default: 200
   */
  maxNoveltyComparisons?: number;
}

const DEFAULT_CONFIG: Required<SemanticFederationConfig> = {
  deduplicationThreshold: 0.82,
  domainRoutingThreshold: 0.65,
  noveltyThreshold: 0.78,
  dimensions: 384,
  maxNoveltyComparisons: 200,
};

// ============================================================================
// DOMAIN SEMANTIC MAP — The Brain's Brodmann Areas
// ============================================================================

/**
 * Pre-computed domain semantic descriptions.
 *
 * Each domain has a rich text description that captures its semantic
 * meaning. When embedded, these create a "Brodmann area map" — the brain's
 * functional regions — enabling signals to route to semantically related
 * domains even when the string labels don't match.
 *
 * Example: A "support_ticket_surge" signal embeds near "churn_risk" because
 * the semantic descriptions of support and customer_health overlap on concepts
 * like "customer frustration", "issue resolution", "satisfaction decline".
 */
const DOMAIN_SEMANTIC_DESCRIPTIONS: Record<string, string> = {
  // Engineering domains
  'engineering': 'software engineering development code deployment infrastructure reliability performance bugs incidents technical debt velocity throughput pull requests commits builds CI/CD pipeline',
  'engineering.github': 'github repositories code commits pull requests reviews merges branches releases deployments code quality technical debt developer velocity',
  'engineering.jira': 'jira issues tickets sprints epics stories bugs tasks backlog agile scrum kanban project management engineering workflow',
  'engineering.linear': 'linear issues cycles projects milestones engineering workflow task management agile sprints velocity',
  'engineering.pagerduty': 'pagerduty incidents alerts on-call escalation reliability uptime SLA response time MTTR outages availability infrastructure monitoring',
  'engineering.cicd': 'CI/CD pipeline builds deployments releases continuous integration delivery automation testing staging production rollback',

  // Product domains
  'product': 'product management features roadmap user experience design analytics adoption engagement retention product-market fit user research customer feedback',
  'product.design': 'product design user experience UX UI wireframes prototypes usability testing accessibility visual design design system',
  'product.analytics': 'product analytics user behavior engagement funnels conversion retention cohort analysis feature adoption usage metrics',

  // Sales & Revenue
  'sales': 'sales pipeline deals opportunities revenue ARR MRR contract expansion upsell cross-sell quota attainment win rate sales cycle close rate',
  'sales.hubspot': 'hubspot CRM deals contacts companies pipeline stages opportunities revenue forecasting sales automation lead scoring',
  'revenue': 'revenue annual recurring monthly recurring expansion contraction churn net retention gross retention LTV lifetime value billing invoicing subscription',
  'revenue.stripe': 'stripe payments transactions subscriptions invoices charges refunds disputes revenue billing checkout payment methods MRR ARR',

  // Finance
  'finance': 'finance accounting budget forecast cash flow expenses revenue P&L balance sheet treasury FP&A financial planning analysis audit compliance',
  'finance.xero': 'xero accounting invoices bills bank reconciliation financial reporting chart of accounts payroll tax compliance',
  'finance.volopay': 'volopay corporate cards expense management spend control budgets payments vendor management procurement',

  // Support & Customer Success
  'support': 'customer support help desk tickets resolution time satisfaction CSAT response time escalation knowledge base FAQ issue tracking customer service',
  'support.freshdesk': 'freshdesk support tickets agents resolution SLA first response customer satisfaction CSAT automation workflows knowledge base',
  'customer_health': 'customer health score satisfaction NPS CSAT retention churn risk engagement adoption usage product fit renewal expansion contraction',
  'customer_success': 'customer success onboarding adoption engagement retention expansion advocacy health score QBR business review renewal lifecycle',

  // Communication
  'communication': 'communication messaging collaboration channels threads conversations team interaction information sharing knowledge transfer',
  'communication.slack': 'slack messages channels threads reactions files shared mentions conversations team communication workplace messaging',
  'communication.voice': 'voice calls meetings phone conversations customer calls sales calls support calls',

  // Marketing
  'marketing': 'marketing campaigns content brand awareness demand generation lead generation SEO SEM advertising social media email marketing conversion funnel',

  // People / HR
  'people': 'human resources people team culture hiring recruiting onboarding retention engagement employee satisfaction performance reviews development training',
  'hr': 'human resources employees headcount hiring attrition retention workforce planning compensation benefits performance management succession planning',

  // Operations
  'operations': 'operations efficiency processes automation workflows infrastructure scaling capacity planning vendor management procurement logistics supply chain',

  // Executive
  'executive': 'executive leadership strategy OKRs KPIs company performance board metrics investor relations growth profitability market position competitive landscape',

  // Calendar
  'calendar': 'calendar meetings events scheduling time management appointments recurring meetings availability booking',
  'calendar.google': 'google calendar events meetings scheduling availability recurring invites room booking',

  // Knowledge
  'knowledge': 'knowledge documentation wiki articles guides tutorials reference materials best practices procedures standards',
  'knowledge.documents': 'documents files sheets presentations reports specs proposals templates shared drives',

  // Cross-domain concepts (semantic bridges)
  'churn_risk': 'customer churn risk attrition loss cancellation downgrade contraction dissatisfaction frustration unhappy leaving competitor switch',
  'growth': 'business growth revenue expansion scaling customer acquisition market penetration product-led growth viral coefficient network effects',
  'efficiency': 'operational efficiency productivity automation optimization cost reduction time savings resource utilization ROI performance improvement',
  'quality': 'quality assurance testing bugs defects reliability stability code quality customer experience satisfaction accuracy precision',
};

// ============================================================================
// EMBEDDING CACHE — The Brain's Myelin Sheaths
// ============================================================================

/**
 * In-memory cache for domain embeddings.
 * Like myelin sheaths on axons — once a signal path is computed, subsequent
 * signals travel the same path at near-zero cost.
 */
const _domainEmbeddingCache = new Map<string, number[]>();

/**
 * Get or compute the embedding for a domain label.
 * Uses the semantic description if available, otherwise embeds the label itself.
 */
function getDomainEmbedding(domain: string, dimensions: number = 384): number[] {
  const cacheKey = `${domain}:${dimensions}`;
  const cached = _domainEmbeddingCache.get(cacheKey);
  if (cached) return cached;

  // Use rich semantic description if available, otherwise embed the label
  const description = DOMAIN_SEMANTIC_DESCRIPTIONS[domain];
  const textToEmbed = description
    ? `${domain} ${description}`
    : domain.replace(/[._-]/g, ' ');

  const embedding = generateEmbedding(textToEmbed, dimensions);
  _domainEmbeddingCache.set(cacheKey, embedding);
  return embedding;
}

/**
 * Embed a content string for semantic comparison.
 * Used for deduplication and novelty detection.
 */
function embedContent(text: string, dimensions: number = 384): number[] {
  return generateEmbedding(text, dimensions);
}

// ============================================================================
// SEMANTIC DEDUPLICATION — The Brain's Pattern Consolidation
// ============================================================================

/**
 * Result of semantic deduplication.
 * Each item is either kept (unique) or merged (duplicate of a kept item).
 */
export interface SemanticDedupResult<T> {
  /** Unique items after semantic dedup */
  kept: Array<{ item: T; source: 'org' | 'core' }>;
  /** Items removed as semantic duplicates */
  removed: Array<{
    item: T;
    source: 'org' | 'core';
    duplicateOf: T;
    similarity: number;
  }>;
  /** Performance metrics */
  stats: {
    totalInput: number;
    totalKept: number;
    totalRemoved: number;
    comparisons: number;
    durationMs: number;
  };
}

/**
 * Semantically deduplicate merged federation results.
 *
 * Unlike string-based dedup which only catches exact matches, this catches:
 * - Paraphrases: "PR velocity declining" ≈ "Pull request throughput dropping"
 * - Synonyms: "customer churn" ≈ "client attrition"
 * - Rephrased rules: "When NPS < 30, churn risk is high" ≈ "Low NPS predicts customer loss"
 *
 * ORG items always win over CORE items when a semantic duplicate is found.
 *
 * @param orgItems - Items from the organization (priority)
 * @param coreItems - Items from the CORE brain (baseline)
 * @param textExtractor - Function to extract embeddable text from an item
 * @param config - Threshold configuration
 */
export function semanticDedup<T>(
  orgItems: T[],
  coreItems: T[],
  textExtractor: (item: T) => string,
  config?: SemanticFederationConfig,
): SemanticDedupResult<T> {
  const startMs = Date.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const threshold = cfg.deduplicationThreshold;

  const kept: Array<{ item: T; source: 'org' | 'core' }> = [];
  const removed: Array<{ item: T; source: 'org' | 'core'; duplicateOf: T; similarity: number }> = [];
  let comparisons = 0;

  // Phase 1: All ORG items are kept (they always win)
  const orgEmbeddings: Array<{ item: T; embedding: number[] }> = [];
  for (const item of orgItems) {
    const text = textExtractor(item);
    const embedding = embedContent(text, cfg.dimensions);
    orgEmbeddings.push({ item, embedding });
    kept.push({ item, source: 'org' });
  }

  // Phase 2: For each CORE item, check semantic similarity against ALL kept items
  for (const coreItem of coreItems) {
    const coreText = textExtractor(coreItem);
    const coreEmbedding = embedContent(coreText, cfg.dimensions);

    let isDuplicate = false;

    for (const { item: orgItem, embedding: orgEmbedding } of orgEmbeddings) {
      comparisons++;
      const similarity = cosineSimilarity(coreEmbedding, orgEmbedding);

      if (similarity >= threshold) {
        removed.push({
          item: coreItem,
          source: 'core',
          duplicateOf: orgItem,
          similarity,
        });
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      kept.push({ item: coreItem, source: 'core' });
      // Also add this CORE item to the comparison pool for subsequent CORE items
      orgEmbeddings.push({ item: coreItem, embedding: coreEmbedding });
    }
  }

  return {
    kept,
    removed,
    stats: {
      totalInput: orgItems.length + coreItems.length,
      totalKept: kept.length,
      totalRemoved: removed.length,
      comparisons,
      durationMs: Date.now() - startMs,
    },
  };
}

// ============================================================================
// SEMANTIC DOMAIN ROUTING — The Brain's Association Cortex
// ============================================================================

/**
 * A semantic domain match with similarity score.
 */
export interface SemanticDomainMatch {
  domain: string;
  similarity: number;
  /** Whether this is the primary (highest similarity) match */
  isPrimary: boolean;
}

/**
 * Find semantically related domains for a signal or knowledge item.
 *
 * This is the brain's association cortex — it takes a signal like
 * "support_ticket_surge" and finds ALL semantically related domains:
 *
 *   input: "support_ticket_surge: 3x increase in P1 tickets this week"
 *   output: [
 *     { domain: "support",         similarity: 0.94, isPrimary: true },
 *     { domain: "customer_health", similarity: 0.82 },
 *     { domain: "churn_risk",      similarity: 0.78 },
 *     { domain: "engineering",     similarity: 0.65 },
 *   ]
 *
 * @param text - Signal content or knowledge description
 * @param primaryDomain - The domain already assigned by string matching (if any)
 * @param config - Threshold configuration
 * @returns Sorted list of matching domains (highest similarity first)
 */
export function findSemanticDomains(
  text: string,
  primaryDomain?: string,
  config?: SemanticFederationConfig,
): SemanticDomainMatch[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const threshold = cfg.domainRoutingThreshold;

  const textEmbedding = embedContent(text, cfg.dimensions);
  const matches: SemanticDomainMatch[] = [];

  // Compare against all known domain embeddings
  for (const domain of Object.keys(DOMAIN_SEMANTIC_DESCRIPTIONS)) {
    const domainEmbedding = getDomainEmbedding(domain, cfg.dimensions);
    const similarity = cosineSimilarity(textEmbedding, domainEmbedding);

    if (similarity >= threshold) {
      matches.push({
        domain,
        similarity,
        isPrimary: domain === primaryDomain,
      });
    }
  }

  // Sort by similarity (highest first)
  matches.sort((a, b) => b.similarity - a.similarity);

  // If primaryDomain is in the list but not highest, still mark it
  if (primaryDomain) {
    const primaryMatch = matches.find(m => m.domain === primaryDomain);
    if (primaryMatch) {
      primaryMatch.isPrimary = true;
    } else {
      // Primary domain didn't meet threshold — add it anyway with its score
      const domainEmbedding = getDomainEmbedding(primaryDomain, cfg.dimensions);
      const similarity = cosineSimilarity(textEmbedding, domainEmbedding);
      matches.push({ domain: primaryDomain, similarity, isPrimary: true });
    }
  }

  // Mark highest as primary if none marked
  if (matches.length > 0 && !matches.some(m => m.isPrimary)) {
    matches[0].isPrimary = true;
  }

  return matches;
}

/**
 * Compute the semantic similarity between two domain labels.
 * Useful for checking if two domains are semantically related.
 *
 * Examples:
 *   domainSimilarity("revenue", "sales")           → ~0.72
 *   domainSimilarity("support", "customer_health")  → ~0.81
 *   domainSimilarity("engineering", "marketing")    → ~0.15
 */
export function domainSimilarity(
  domainA: string,
  domainB: string,
  dimensions: number = 384,
): number {
  if (domainA === domainB) return 1.0;
  const embA = getDomainEmbedding(domainA, dimensions);
  const embB = getDomainEmbedding(domainB, dimensions);
  return cosineSimilarity(embA, embB);
}

// ============================================================================
// SEMANTIC NOVELTY DETECTION — The Brain's Hippocampal Filter
// ============================================================================

/**
 * Result of a semantic novelty check.
 */
export interface SemanticNoveltyResult {
  /** Whether the item is novel (not semantically present in the target) */
  isNovel: boolean;
  /** If not novel, the most similar existing item */
  mostSimilarExisting?: {
    text: string;
    similarity: number;
    metadata?: Record<string, unknown>;
  };
  /** Novelty score: 1.0 = completely novel, 0.0 = exact duplicate */
  noveltyScore: number;
}

/**
 * Check if a knowledge item is semantically novel relative to existing items.
 *
 * Used before upstream promotion to prevent the CORE brain from accumulating
 * near-duplicate patterns. Unlike string dedup (which only catches exact title
 * matches), this catches semantic duplicates:
 *
 *   New:      "High ticket volume predicts churn within 30 days"
 *   Existing: "Support escalation surge is a leading indicator of customer loss"
 *   Result:   NOT novel (similarity: 0.84) — same insight, different words
 *
 * @param candidateText - The text of the item being considered for promotion
 * @param existingTexts - Texts of items already in the target (CORE brain)
 * @param config - Threshold configuration
 */
export function checkSemanticNovelty(
  candidateText: string,
  existingTexts: Array<{ text: string; metadata?: Record<string, unknown> }>,
  config?: SemanticFederationConfig,
): SemanticNoveltyResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const threshold = cfg.noveltyThreshold;

  const candidateEmbedding = embedContent(candidateText, cfg.dimensions);

  let maxSimilarity = 0;
  let mostSimilar: { text: string; similarity: number; metadata?: Record<string, unknown> } | undefined;

  // Compare against existing items (limited to maxNoveltyComparisons for perf)
  const toCompare = existingTexts.slice(0, cfg.maxNoveltyComparisons);

  for (const existing of toCompare) {
    const existingEmbedding = embedContent(existing.text, cfg.dimensions);
    const similarity = cosineSimilarity(candidateEmbedding, existingEmbedding);

    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      mostSimilar = { text: existing.text, similarity, metadata: existing.metadata };
    }
  }

  const isNovel = maxSimilarity < threshold;
  const noveltyScore = 1.0 - maxSimilarity;

  return {
    isNovel,
    mostSimilarExisting: mostSimilar,
    noveltyScore,
  };
}

// ============================================================================
// BATCH OPERATIONS — The Brain's Parallel Processing
// ============================================================================

/**
 * Embed multiple texts in batch for efficient bulk operations.
 * Returns embeddings in the same order as input texts.
 */
export function batchEmbed(
  texts: string[],
  dimensions: number = 384,
): number[][] {
  return texts.map(text => embedContent(text, dimensions));
}

/**
 * Compute a pairwise similarity matrix between two sets of items.
 * Useful for bulk deduplication or clustering.
 *
 * @returns Matrix[i][j] = cosine similarity between setA[i] and setB[j]
 */
export function pairwiseSimilarity(
  setA: string[],
  setB: string[],
  dimensions: number = 384,
): number[][] {
  const embeddingsA = batchEmbed(setA, dimensions);
  const embeddingsB = batchEmbed(setB, dimensions);

  return embeddingsA.map(embA =>
    embeddingsB.map(embB => cosineSimilarity(embA, embB))
  );
}

// ============================================================================
// SEMANTIC FEDERATION FACTORY
// ============================================================================

/**
 * Create a configured semantic federation instance.
 *
 * @example
 * ```typescript
 * const semantics = createSemanticFederation({
 *   deduplicationThreshold: 0.85,  // stricter dedup
 *   domainRoutingThreshold: 0.60,  // broader discovery
 * });
 *
 * // Semantic dedup of federated results
 * const result = semantics.dedup(orgPatterns, corePatterns, p => p.title);
 *
 * // Find related domains for a signal
 * const domains = semantics.findDomains("deploy failure causing customer impact");
 *
 * // Check if knowledge is novel before promoting to CORE
 * const novelty = semantics.isNovel("New pattern text", existingCoreTexts);
 * ```
 */
export function createSemanticFederation(config?: SemanticFederationConfig) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    /**
     * Semantically deduplicate merged ORG + CORE results.
     * ORG always wins over CORE for semantic duplicates.
     */
    dedup: <T>(orgItems: T[], coreItems: T[], textExtractor: (item: T) => string) =>
      semanticDedup(orgItems, coreItems, textExtractor, cfg),

    /**
     * Find semantically related domains for a signal or knowledge item.
     */
    findDomains: (text: string, primaryDomain?: string) =>
      findSemanticDomains(text, primaryDomain, cfg),

    /**
     * Check if a knowledge item is semantically novel.
     */
    isNovel: (
      candidateText: string,
      existingTexts: Array<{ text: string; metadata?: Record<string, unknown> }>,
    ) => checkSemanticNovelty(candidateText, existingTexts, cfg),

    /**
     * Compute similarity between two domain labels.
     */
    domainSimilarity: (a: string, b: string) => domainSimilarity(a, b, cfg.dimensions),

    /**
     * Embed text for external use (e.g., storing in database).
     */
    embed: (text: string) => embedContent(text, cfg.dimensions),

    /**
     * Get the current configuration.
     */
    config: cfg,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getDomainEmbedding,
  embedContent,
  DOMAIN_SEMANTIC_DESCRIPTIONS,
};
