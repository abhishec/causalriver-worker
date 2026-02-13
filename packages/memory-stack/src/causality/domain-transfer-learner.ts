/**
 * Domain Transfer Learner
 *
 * LLM-level cognitive capability: the brain's knowledge is siloed per
 * organization. LLMs gain power from massive cross-domain transfer. This
 * module enables cross-org learning through domain alignment, causal
 * prior transfer, and meta-learning of universal causal structures.
 *
 * Features:
 * - Domain name alignment (canonical mapping of equivalent domains)
 * - Cross-org causal prior extraction (universal lag/weight patterns)
 * - Few-shot bootstrapping for new orgs (transfer from high-data orgs)
 * - Industry-specific causal templates (SaaS, fintech, etc.)
 * - Confidence-weighted prior blending with org-specific evidence
 *
 * @example
 * ```typescript
 * const transferLearner = createDomainTransferLearner();
 * transferLearner.registerOrgDAG('org-a', dagA);
 * transferLearner.registerOrgDAG('org-b', dagB);
 * const priors = transferLearner.extractUniversalPriors();
 * const bootstrapped = transferLearner.bootstrapNewOrg(dagC, priors);
 * ```
 *
 * @packageDocumentation
 */

import type { CausalDAG } from './continuous-learner';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Canonical domain mapping — maps org-specific domain names to universal names
 */
export interface DomainMapping {
  /** Original domain name in the org */
  orgDomain: string;
  /** Canonical universal name */
  canonicalDomain: string;
  /** Confidence in the mapping (0-1) */
  confidence: number;
  /** Method used for mapping */
  method: 'exact' | 'alias' | 'semantic' | 'manual';
}

/**
 * A universal causal prior — learned from multiple organizations
 */
export interface CausalPrior {
  /** Source canonical domain */
  sourceDomain: string;
  /** Target canonical domain */
  targetDomain: string;
  /** Average edge weight across orgs */
  avgWeight: number;
  /** Standard deviation of weight across orgs */
  weightStd: number;
  /** Median lag days */
  medianLagDays: number;
  /** Number of organizations where this edge was observed */
  orgCount: number;
  /** Minimum orgs needed for this to be a reliable prior */
  isReliable: boolean;
  /** Industry specificity (null = universal) */
  industry?: string;
  /** Confidence in this prior (0-1) */
  confidence: number;
}

/**
 * A registered organization's DAG summary
 */
export interface OrgDAGSummary {
  /** Organization ID */
  orgId: string;
  /** Industry (optional, for industry-specific priors) */
  industry?: string;
  /** Domain mappings to canonical names */
  domainMappings: DomainMapping[];
  /** Number of edges */
  edgeCount: number;
  /** Number of validated edges */
  validatedEdgeCount: number;
  /** Registered at */
  registeredAt: Date;
}

/**
 * Bootstrap result for a new organization
 */
export interface BootstrapResult {
  /** Number of edges added from priors */
  edgesAdded: number;
  /** Number of edges strengthened by priors */
  edgesStrengthened: number;
  /** Applied priors with confidence */
  appliedPriors: Array<{
    source: string;
    target: string;
    priorWeight: number;
    priorLag: number;
    confidence: number;
    orgCount: number;
  }>;
  /** Natural language summary */
  summary: string;
}

/**
 * Transfer accuracy tracking for negative transfer protection
 */
export interface TransferAccuracyRecord {
  /** The prior that was applied */
  sourceDomain: string;
  targetDomain: string;
  /** Weight at time of transfer */
  transferredWeight: number;
  /** Weight the org eventually learned independently */
  observedWeight: number | null;
  /** Did the direction match? */
  directionCorrect: boolean | null;
  /** Did the lag estimate hold? (within 50%) */
  lagAccurate: boolean | null;
  /** Overall transfer score: +1 helpful, 0 neutral, -1 harmful */
  transferScore: number;
  /** Timestamp of evaluation */
  evaluatedAt: Date;
}

/**
 * Transfer validation result — did priors help or hurt?
 */
export interface TransferValidation {
  /** Total priors evaluated */
  priorsEvaluated: number;
  /** Priors where transfer was helpful */
  helpfulCount: number;
  /** Priors where transfer was harmful (negative transfer) */
  harmfulCount: number;
  /** Priors where transfer was neutral */
  neutralCount: number;
  /** Overall transfer effectiveness score (0-1) */
  effectivenessScore: number;
  /** Domains where negative transfer was detected */
  negativeTransferDomains: Array<{ source: string; target: string; harm: string }>;
  /** Recommendation */
  recommendation: 'continue' | 'reduce_priors' | 'stop_transfer';
  /** Narrative */
  narrative: string;
}

/**
 * Configuration for the domain transfer learner
 */
export interface DomainTransferConfig {
  /** Minimum orgs for a prior to be considered reliable (default: 2) */
  minOrgsForPrior: number;
  /** Maximum weight for a transferred prior (default: 0.5) — priors are weaker than direct evidence */
  maxPriorWeight: number;
  /** Decay factor for prior confidence with distance from direct evidence (default: 0.7) */
  priorDecay: number;
  /** Similarity threshold for semantic domain matching (default: 0.7) */
  semanticMatchThreshold: number;
  /** N-gram size for embedding-based matching (default: 3) */
  ngramSize: number;
  /** Minimum embedding similarity to consider a match (default: 0.4) */
  embeddingSimilarityThreshold: number;
  /** Negative transfer threshold — if score drops below, reduce priors (default: 0.3) */
  negativeTransferThreshold: number;
}

// ============================================================================
// DOMAIN ALIASING
// ============================================================================

/**
 * Built-in domain name aliases for canonical mapping.
 * Covers common variations in how organizations name their domains.
 */
const DOMAIN_ALIASES: Record<string, string[]> = {
  'engineering': ['eng', 'development', 'dev', 'product_engineering', 'software', 'tech'],
  'customer_success': ['cs', 'customer_support', 'support', 'client_success', 'cx'],
  'revenue': ['sales_revenue', 'arr', 'mrr', 'bookings', 'income'],
  'sales': ['sales_pipeline', 'deals', 'pipeline', 'business_development', 'bd'],
  'marketing': ['demand_gen', 'demand_generation', 'growth', 'growth_marketing'],
  'product': ['product_management', 'pm', 'product_dev'],
  'finance': ['accounting', 'financial', 'fp_and_a', 'fpa'],
  'hr': ['people', 'people_ops', 'human_resources', 'talent'],
  'operations': ['ops', 'infra', 'infrastructure', 'devops', 'platform'],
  'analytics': ['data', 'bi', 'business_intelligence', 'data_science'],
  'legal': ['compliance', 'legal_compliance'],
  'design': ['ux', 'ui', 'user_experience', 'product_design'],
  'security': ['infosec', 'cybersecurity', 'appsec'],
};

// ============================================================================
// EMBEDDING UTILITIES (character n-gram based, zero external deps)
// ============================================================================

/**
 * Extract character n-grams from a string.
 * E.g., "eng" with n=2 → ["en", "ng"]
 */
function extractNgrams(text: string, n: number): string[] {
  const padded = `$${text.toLowerCase().replace(/[-_\s]+/g, '')}$`;
  const ngrams: string[] = [];
  for (let i = 0; i <= padded.length - n; i++) {
    ngrams.push(padded.substring(i, i + n));
  }
  return ngrams;
}

/**
 * Build a sparse frequency vector from n-grams.
 * Returns a Map<ngram, frequency>.
 */
function buildNgramVector(text: string, ngramSize: number): Map<string, number> {
  const ngrams = extractNgrams(text, ngramSize);
  const vec = new Map<string, number>();
  for (const ng of ngrams) {
    vec.set(ng, (vec.get(ng) || 0) + 1);
  }
  return vec;
}

/**
 * Cosine similarity between two sparse n-gram vectors.
 * Returns 0-1 (1 = identical).
 */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, valA] of a) {
    normA += valA * valA;
    const valB = b.get(key);
    if (valB !== undefined) {
      dotProduct += valA * valB;
    }
  }
  for (const [, valB] of b) {
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a domain transfer learner.
 */
export function createDomainTransferLearner(config: Partial<DomainTransferConfig> = {}) {
  const {
    minOrgsForPrior = 2,
    maxPriorWeight = 0.5,
    priorDecay = 0.7,
    semanticMatchThreshold = 0.7,
    ngramSize = 3,
    embeddingSimilarityThreshold = 0.4,
    negativeTransferThreshold = 0.3,
  } = config;

  // Transfer accuracy tracking
  const transferHistory = new Map<string, TransferAccuracyRecord[]>();

  // Registered org DAGs (in-memory for cross-org learning)
  const orgDAGs = new Map<string, { dag: CausalDAG; mappings: DomainMapping[]; industry?: string }>();

  // Build reverse alias lookup
  const aliasToCanonical = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(DOMAIN_ALIASES)) {
    aliasToCanonical.set(canonical, canonical);
    for (const alias of aliases) {
      aliasToCanonical.set(alias.toLowerCase(), canonical);
    }
  }

  // ── Domain name canonicalization ─────────────────────────────────

  /**
   * Map a domain name to its canonical form.
   * Uses exact match → alias match → partial match → passthrough.
   */
  function canonicalizeDomain(domain: string): DomainMapping {
    const normalized = domain.toLowerCase().replace(/[-\s]+/g, '_').trim();

    // 1. Exact match
    if (aliasToCanonical.has(normalized)) {
      return {
        orgDomain: domain,
        canonicalDomain: aliasToCanonical.get(normalized)!,
        confidence: 1.0,
        method: 'exact',
      };
    }

    // 2. Partial match (domain contains a known alias)
    for (const [alias, canonical] of aliasToCanonical) {
      if (normalized.includes(alias) || alias.includes(normalized)) {
        return {
          orgDomain: domain,
          canonicalDomain: canonical,
          confidence: 0.8,
          method: 'alias',
        };
      }
    }

    // 3. Word overlap (semantic-lite)
    const words = normalized.split('_');
    let bestMatch = '';
    let bestOverlap = 0;
    for (const [alias, canonical] of aliasToCanonical) {
      const aliasWords = alias.split('_');
      const overlap = words.filter(w => aliasWords.includes(w)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = canonical;
      }
    }
    if (bestOverlap > 0 && bestOverlap / words.length >= semanticMatchThreshold) {
      return {
        orgDomain: domain,
        canonicalDomain: bestMatch,
        confidence: 0.6,
        method: 'semantic',
      };
    }

    // 4. Embedding-based matching (character n-gram cosine similarity)
    const inputVec = buildNgramVector(normalized, ngramSize);
    let bestEmbeddingMatch = '';
    let bestSimilarity = 0;
    for (const [alias, canonical] of aliasToCanonical) {
      const aliasVec = buildNgramVector(alias, ngramSize);
      const sim = cosineSimilarity(inputVec, aliasVec);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestEmbeddingMatch = canonical;
      }
    }
    if (bestSimilarity >= embeddingSimilarityThreshold) {
      return {
        orgDomain: domain,
        canonicalDomain: bestEmbeddingMatch,
        confidence: Math.round(Math.min(0.7, bestSimilarity) * 100) / 100,
        method: 'semantic',
      };
    }

    // 5. Passthrough — unknown domain, use as-is
    return {
      orgDomain: domain,
      canonicalDomain: normalized,
      confidence: 0.3,
      method: 'semantic',
    };
  }

  /**
   * Map all domains in a DAG to canonical names.
   */
  function mapDAGDomains(dag: CausalDAG): DomainMapping[] {
    const mappings: DomainMapping[] = [];
    for (const domain of dag.nodes) {
      mappings.push(canonicalizeDomain(domain));
    }
    return mappings;
  }

  // ── Cross-org prior extraction ───────────────────────────────────

  /**
   * Extract universal causal priors from all registered org DAGs.
   */
  function extractUniversalPriors(industry?: string): CausalPrior[] {
    // Collect all edges in canonical domain space
    const edgeStats = new Map<string, Array<{ weight: number; lagDays: number; orgId: string }>>();

    for (const [orgId, { dag, mappings, industry: orgIndustry }] of orgDAGs) {
      if (industry && orgIndustry && orgIndustry !== industry) continue;

      const domainMap = new Map(mappings.map(m => [m.orgDomain.toLowerCase(), m.canonicalDomain]));

      for (const [src, neighbors] of dag.edges) {
        for (const [tgt, edge] of neighbors) {
          const canonSrc = domainMap.get(src.toLowerCase()) ?? src.toLowerCase();
          const canonTgt = domainMap.get(tgt.toLowerCase()) ?? tgt.toLowerCase();
          const key = `${canonSrc}→${canonTgt}`;

          if (!edgeStats.has(key)) edgeStats.set(key, []);
          edgeStats.get(key)!.push({
            weight: edge.weight,
            lagDays: edge.lagDays,
            orgId,
          });
        }
      }
    }

    // Build priors from aggregated stats
    const priors: CausalPrior[] = [];

    for (const [key, stats] of edgeStats) {
      const [src, tgt] = key.split('→');
      const orgCount = new Set(stats.map(s => s.orgId)).size;

      const weights = stats.map(s => s.weight);
      const lags = stats.map(s => s.lagDays);

      const avgWeight = weights.reduce((s, w) => s + w, 0) / weights.length;
      const weightStd = Math.sqrt(
        weights.reduce((s, w) => s + (w - avgWeight) ** 2, 0) / weights.length
      );

      // Median lag
      const sortedLags = [...lags].sort((a, b) => a - b);
      const medianLag = sortedLags[Math.floor(sortedLags.length / 2)];

      const isReliable = orgCount >= minOrgsForPrior;

      // Confidence: higher with more orgs, lower with high variance
      const orgConfidence = Math.min(1, orgCount / (minOrgsForPrior * 2));
      const varianceDiscount = 1 / (1 + weightStd);
      const confidence = Math.round(orgConfidence * varianceDiscount * 100) / 100;

      priors.push({
        sourceDomain: src,
        targetDomain: tgt,
        avgWeight,
        weightStd: Math.round(weightStd * 1000) / 1000,
        medianLagDays: medianLag,
        orgCount,
        isReliable,
        industry,
        confidence,
      });
    }

    return priors.sort((a, b) => b.confidence - a.confidence);
  }

  // ── New org bootstrapping ────────────────────────────────────────

  /**
   * Bootstrap a new org's DAG with universal causal priors.
   * Priors are added with reduced weight (maxPriorWeight cap).
   */
  function bootstrapNewOrg(
    dag: CausalDAG,
    priors: CausalPrior[],
    orgDomainMappings?: DomainMapping[],
  ): BootstrapResult {
    const mappings = orgDomainMappings ?? mapDAGDomains(dag);
    const canonToOrg = new Map<string, string>();
    for (const m of mappings) {
      canonToOrg.set(m.canonicalDomain, m.orgDomain);
    }

    let edgesAdded = 0;
    let edgesStrengthened = 0;
    const appliedPriors: BootstrapResult['appliedPriors'] = [];

    for (const prior of priors) {
      if (!prior.isReliable) continue;

      const orgSrc = canonToOrg.get(prior.sourceDomain);
      const orgTgt = canonToOrg.get(prior.targetDomain);
      if (!orgSrc || !orgTgt) continue;

      // Check if edge already exists
      const existing = dag.edges.get(orgSrc)?.get(orgTgt);
      const priorWeight = Math.min(maxPriorWeight, prior.avgWeight * priorDecay * prior.confidence);

      if (!existing) {
        // Add new edge from prior
        if (!dag.edges.has(orgSrc)) dag.edges.set(orgSrc, new Map());
        dag.edges.get(orgSrc)!.set(orgTgt, {
          weight: priorWeight,
          pValue: 0.1, // Moderate significance (prior, not direct evidence)
          lagDays: prior.medianLagDays,
          lastUpdated: new Date(),
          sampleSize: 0, // No direct observations yet
        });
        edgesAdded++;
      } else {
        // Strengthen existing edge if prior agrees and is stronger
        if (priorWeight > existing.weight * 0.8) {
          // Bayesian blending: combine prior with existing evidence
          const blendedWeight = existing.sampleSize > 10
            ? existing.weight * 0.8 + priorWeight * 0.2  // Strong existing evidence
            : existing.weight * 0.5 + priorWeight * 0.5; // Weak existing evidence
          existing.weight = Math.min(1, blendedWeight);
          edgesStrengthened++;
        }
      }

      appliedPriors.push({
        source: orgSrc,
        target: orgTgt,
        priorWeight,
        priorLag: prior.medianLagDays,
        confidence: prior.confidence,
        orgCount: prior.orgCount,
      });
    }

    const summary = edgesAdded + edgesStrengthened > 0
      ? `Bootstrapped with ${edgesAdded} new edge(s) and strengthened ${edgesStrengthened} existing edge(s) from cross-org priors (${priors.filter(p => p.isReliable).length} reliable priors available).`
      : 'No applicable priors found for this org\'s domain structure.';

    return { edgesAdded, edgesStrengthened, appliedPriors, summary };
  }

  // ── Negative transfer protection ──────────────────────────────────

  /**
   * Validate whether transferred priors actually helped or hurt the org's DAG.
   * Compares prior predictions against what the org independently learned.
   */
  function validateTransferAccuracy(
    dag: CausalDAG,
    appliedPriors: BootstrapResult['appliedPriors'],
  ): TransferValidation {
    const records: TransferAccuracyRecord[] = [];

    for (const prior of appliedPriors) {
      const currentEdge = dag.edges.get(prior.source)?.get(prior.target);

      let directionCorrect: boolean | null = null;
      let lagAccurate: boolean | null = null;
      let observedWeight: number | null = null;
      let transferScore = 0;

      if (currentEdge && currentEdge.sampleSize > 5) {
        // Org has now gathered enough direct evidence to compare
        observedWeight = currentEdge.weight;

        // Direction check: did prior predict the same direction?
        directionCorrect = (prior.priorWeight > 0) === (currentEdge.weight > 0);

        // Lag accuracy: within 50% of predicted lag?
        if (currentEdge.lagDays !== undefined && prior.priorLag > 0) {
          const lagRatio = Math.abs(currentEdge.lagDays - prior.priorLag) / prior.priorLag;
          lagAccurate = lagRatio <= 0.5;
        }

        // Scoring:
        // +1 if direction correct AND weight within 50%
        // -1 if direction wrong (negative transfer — prior was misleading)
        // 0.5 if direction correct but weight significantly off
        // 0 if not enough data
        if (!directionCorrect) {
          transferScore = -1; // Negative transfer!
        } else {
          const weightError = Math.abs(currentEdge.weight - prior.priorWeight) / Math.max(0.01, prior.priorWeight);
          transferScore = weightError < 0.5 ? 1.0 : weightError < 1.0 ? 0.5 : 0.25;
          if (lagAccurate) transferScore = Math.min(1, transferScore + 0.1);
        }
      } else if (currentEdge && currentEdge.sampleSize <= 5) {
        // Not enough evidence yet — neutral
        transferScore = 0;
      } else {
        // Edge was removed by the org (pruned) — prior was likely wrong
        transferScore = -0.5;
      }

      const record: TransferAccuracyRecord = {
        sourceDomain: prior.source,
        targetDomain: prior.target,
        transferredWeight: prior.priorWeight,
        observedWeight,
        directionCorrect,
        lagAccurate,
        transferScore,
        evaluatedAt: new Date(),
      };
      records.push(record);

      // Track history
      const key = `${prior.source}→${prior.target}`;
      if (!transferHistory.has(key)) transferHistory.set(key, []);
      transferHistory.get(key)!.push(record);
    }

    const evaluated = records.filter(r => r.transferScore !== 0);
    const helpful = evaluated.filter(r => r.transferScore > 0);
    const harmful = evaluated.filter(r => r.transferScore < 0);
    const neutral = records.filter(r => r.transferScore === 0);

    const totalScore = evaluated.length > 0
      ? evaluated.reduce((s, r) => s + r.transferScore, 0) / evaluated.length
      : 0.5; // No data → assume neutral

    const effectivenessScore = Math.max(0, Math.min(1, (totalScore + 1) / 2)); // Map -1..+1 to 0..1

    const negativeTransferDomains = harmful.map(r => ({
      source: r.sourceDomain,
      target: r.targetDomain,
      harm: r.directionCorrect === false
        ? `Prior predicted ${r.transferredWeight > 0 ? 'positive' : 'negative'} effect, but org evidence shows ${(r.observedWeight ?? 0) > 0 ? 'positive' : 'negative'}`
        : `Prior weight ${r.transferredWeight.toFixed(3)} significantly differs from observed ${(r.observedWeight ?? 0).toFixed(3)}`,
    }));

    let recommendation: TransferValidation['recommendation'] = 'continue';
    if (effectivenessScore < negativeTransferThreshold) {
      recommendation = 'stop_transfer';
    } else if (effectivenessScore < 0.5) {
      recommendation = 'reduce_priors';
    }

    const narrative = evaluated.length === 0
      ? 'Insufficient org evidence to evaluate transfer effectiveness. Priors are still bootstrapping.'
      : `Transfer effectiveness: ${(effectivenessScore * 100).toFixed(0)}%. ` +
        `${helpful.length}/${evaluated.length} priors were helpful, ${harmful.length} harmful. ` +
        (recommendation === 'stop_transfer'
          ? 'ALERT: Negative transfer detected — prior transfer should be stopped for this org.'
          : recommendation === 'reduce_priors'
            ? 'Warning: Mixed transfer results — reduce prior weight to avoid harm.'
            : 'Transfer learning is benefiting this org.');

    return {
      priorsEvaluated: evaluated.length,
      helpfulCount: helpful.length,
      harmfulCount: harmful.length,
      neutralCount: neutral.length,
      effectivenessScore: Math.round(effectivenessScore * 1000) / 1000,
      negativeTransferDomains,
      recommendation,
      narrative,
    };
  }

  /**
   * Compute embedding similarity between two domain names.
   * Uses character n-gram cosine similarity.
   */
  function computeDomainSimilarity(domainA: string, domainB: string): number {
    const vecA = buildNgramVector(domainA.toLowerCase().replace(/[-\s]+/g, '_'), ngramSize);
    const vecB = buildNgramVector(domainB.toLowerCase().replace(/[-\s]+/g, '_'), ngramSize);
    return cosineSimilarity(vecA, vecB);
  }

  /**
   * Find the best domain match across all registered orgs using embedding similarity.
   * Useful for mapping unknown domain names to known ones.
   */
  function findBestDomainMatch(unknownDomain: string): { match: string; similarity: number; orgId: string } | null {
    let best: { match: string; similarity: number; orgId: string } | null = null;

    for (const [orgId, { dag }] of orgDAGs) {
      for (const domain of dag.nodes) {
        const sim = computeDomainSimilarity(unknownDomain, domain);
        if (sim > (best?.similarity ?? 0) && sim >= embeddingSimilarityThreshold) {
          best = { match: domain, similarity: sim, orgId };
        }
      }
    }

    return best;
  }

  // ── Auto-Refresh Domain Mappings ──────────────────────────────────

  /**
   * Refresh domain mappings for an org when its DAG has new nodes.
   * Re-runs the full canonicalization pipeline including n-gram matching.
   * Should be called whenever new domains appear in an org's DAG.
   */
  function refreshDomainMappings(orgId: string): DomainMapping[] | null {
    const entry = orgDAGs.get(orgId);
    if (!entry) return null;

    const newMappings = mapDAGDomains(entry.dag);
    entry.mappings = newMappings;
    return newMappings;
  }

  // ── Per-Industry Transferability Tracking ────────────────────────

  /**
   * Industry-pair transferability scores.
   * Tracks whether priors from industry A transfer well to industry B
   * at a per-edge-type granularity.
   */
  const industryTransferability = new Map<string, {
    successCount: number;
    failureCount: number;
    score: number; // 0-1
  }>();

  /**
   * Record a transfer outcome for a specific industry pair + edge type.
   * Over time, this builds a matrix of which cross-industry transfers are safe.
   */
  function recordIndustryTransfer(
    sourceIndustry: string,
    targetIndustry: string,
    sourceDomain: string,
    targetDomain: string,
    wasHelpful: boolean,
  ): void {
    // Track at two granularities: industry-pair and industry-pair+edge
    const pairKey = `${sourceIndustry}→${targetIndustry}`;
    const edgeKey = `${pairKey}:${sourceDomain}→${targetDomain}`;

    for (const key of [pairKey, edgeKey]) {
      if (!industryTransferability.has(key)) {
        industryTransferability.set(key, { successCount: 0, failureCount: 0, score: 0.5 });
      }
      const record = industryTransferability.get(key)!;
      if (wasHelpful) {
        record.successCount++;
      } else {
        record.failureCount++;
      }
      const total = record.successCount + record.failureCount;
      record.score = total > 0 ? record.successCount / total : 0.5;
    }
  }

  /**
   * Get the transferability score for priors from one industry to another.
   * Optionally specify edge type for more granular assessment.
   * Returns 0-1 (1 = always transfers well, 0 = never transfers well).
   */
  function getIndustryTransferability(
    sourceIndustry: string,
    targetIndustry: string,
    sourceDomain?: string,
    targetDomain?: string,
  ): { score: number; confidence: number; sampleSize: number } {
    // First check edge-level granularity
    if (sourceDomain && targetDomain) {
      const edgeKey = `${sourceIndustry}→${targetIndustry}:${sourceDomain}→${targetDomain}`;
      const edgeRecord = industryTransferability.get(edgeKey);
      if (edgeRecord && (edgeRecord.successCount + edgeRecord.failureCount) >= 3) {
        const total = edgeRecord.successCount + edgeRecord.failureCount;
        return {
          score: edgeRecord.score,
          confidence: Math.min(1, total / 10), // Confidence grows with sample size
          sampleSize: total,
        };
      }
    }

    // Fall back to industry-pair level
    const pairKey = `${sourceIndustry}→${targetIndustry}`;
    const pairRecord = industryTransferability.get(pairKey);
    if (pairRecord) {
      const total = pairRecord.successCount + pairRecord.failureCount;
      return {
        score: pairRecord.score,
        confidence: Math.min(1, total / 20), // Need more samples at coarse level
        sampleSize: total,
      };
    }

    // No data — neutral prior
    return { score: 0.5, confidence: 0, sampleSize: 0 };
  }

  /**
   * Apply industry transferability discounting to priors.
   * Reduces prior weight when cross-industry transfer is known to be unreliable.
   */
  function discountPriorsByIndustry(
    priors: CausalPrior[],
    targetIndustry: string,
  ): CausalPrior[] {
    return priors.map(prior => {
      if (!prior.industry || prior.industry === targetIndustry) {
        return prior; // Same industry or universal — no discount
      }

      const transferability = getIndustryTransferability(
        prior.industry,
        targetIndustry,
        prior.sourceDomain,
        prior.targetDomain,
      );

      if (transferability.confidence < 0.2) {
        return prior; // Not enough data to discount
      }

      // Discount confidence by transferability score
      return {
        ...prior,
        confidence: Math.round(prior.confidence * transferability.score * 1000) / 1000,
      };
    });
  }

  // ── Progressive Prior Decay ──────────────────────────────────────

  /**
   * Compute progressive prior decay factor based on org's own evidence.
   * As the org accumulates its own data, priors should fade naturally.
   * Factor approaches 0 as orgSampleSize → ∞.
   */
  function computePriorDecayFactor(orgSampleSize: number, minSampleForFullDecay: number = 50): number {
    return minSampleForFullDecay / (minSampleForFullDecay + orgSampleSize);
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    /**
     * Register an org's DAG for cross-org learning.
     */
    registerOrgDAG(orgId: string, dag: CausalDAG, industry?: string): OrgDAGSummary {
      const mappings = mapDAGDomains(dag);
      let validatedCount = 0;
      let edgeCount = 0;

      for (const [, neighbors] of dag.edges) {
        for (const [, edge] of neighbors) {
          edgeCount++;
          if ((edge.knockoutScore ?? 0) > 0.5 && !edge.isLikelyConfounded) {
            validatedCount++;
          }
        }
      }

      orgDAGs.set(orgId, { dag, mappings, industry });

      return {
        orgId,
        industry,
        domainMappings: mappings,
        edgeCount,
        validatedEdgeCount: validatedCount,
        registeredAt: new Date(),
      };
    },

    /**
     * Canonicalize a domain name.
     */
    canonicalizeDomain,

    /**
     * Map all domains in a DAG to canonical names.
     */
    mapDAGDomains,

    /**
     * Extract universal causal priors from all registered orgs.
     * Optionally filter by industry.
     */
    extractUniversalPriors(industry?: string): CausalPrior[] {
      return extractUniversalPriors(industry);
    },

    /**
     * Bootstrap a new org's DAG with cross-org priors.
     */
    bootstrapNewOrg(
      dag: CausalDAG,
      priors?: CausalPrior[],
    ): BootstrapResult {
      const resolvedPriors = priors ?? extractUniversalPriors();
      return bootstrapNewOrg(dag, resolvedPriors);
    },

    /**
     * Get the number of registered organizations.
     */
    getRegisteredOrgCount(): number {
      return orgDAGs.size;
    },

    /**
     * Validate whether transferred priors helped or hurt an org's learning.
     * Call after the org has gathered enough direct evidence (sampleSize > 5 on edges).
     */
    validateTransferAccuracy(
      dag: CausalDAG,
      appliedPriors: BootstrapResult['appliedPriors'],
    ): TransferValidation {
      return validateTransferAccuracy(dag, appliedPriors);
    },

    /**
     * Compute embedding-based similarity between two domain names.
     * Uses character n-gram cosine similarity (0-1).
     */
    computeDomainSimilarity,

    /**
     * Find the best matching domain across all registered orgs for an unknown domain.
     * Returns null if no match exceeds the similarity threshold.
     */
    findBestDomainMatch,

    /**
     * Get transfer accuracy history for a specific edge.
     */
    getTransferHistory(source: string, target: string): TransferAccuracyRecord[] {
      return transferHistory.get(`${source}→${target}`) ?? [];
    },

    /**
     * Refresh domain mappings for an org when its DAG has changed.
     * Re-runs canonicalization including n-gram embedding matching.
     */
    refreshDomainMappings(orgId: string): DomainMapping[] | null {
      return refreshDomainMappings(orgId);
    },

    /**
     * Record a cross-industry transfer outcome for transferability learning.
     */
    recordIndustryTransfer(
      sourceIndustry: string,
      targetIndustry: string,
      sourceDomain: string,
      targetDomain: string,
      wasHelpful: boolean,
    ): void {
      recordIndustryTransfer(sourceIndustry, targetIndustry, sourceDomain, targetDomain, wasHelpful);
    },

    /**
     * Get transferability score for a specific industry pair (+optional edge type).
     */
    getIndustryTransferability(
      sourceIndustry: string,
      targetIndustry: string,
      sourceDomain?: string,
      targetDomain?: string,
    ) {
      return getIndustryTransferability(sourceIndustry, targetIndustry, sourceDomain, targetDomain);
    },

    /**
     * Discount priors by cross-industry transferability.
     * Use this before bootstrapNewOrg to apply industry-aware weighting.
     */
    discountPriorsByIndustry(priors: CausalPrior[], targetIndustry: string): CausalPrior[] {
      return discountPriorsByIndustry(priors, targetIndustry);
    },

    /**
     * Compute progressive prior decay factor.
     * Returns 0-1: high when org has little data, approaches 0 as org evidence grows.
     */
    computePriorDecayFactor(orgSampleSize: number, minSampleForFullDecay?: number): number {
      return computePriorDecayFactor(orgSampleSize, minSampleForFullDecay);
    },

    /**
     * Get domain alias map (for debugging/display).
     */
    getDomainAliases(): Record<string, string[]> {
      return { ...DOMAIN_ALIASES };
    },

    /**
     * Get the configuration.
     */
    getConfig(): DomainTransferConfig {
      return { minOrgsForPrior, maxPriorWeight, priorDecay, semanticMatchThreshold, ngramSize, embeddingSimilarityThreshold, negativeTransferThreshold };
    },
  };
}
