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
  } = config;

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

    // 4. Passthrough — unknown domain, use as-is
    return {
      orgDomain: domain,
      canonicalDomain: normalized,
      confidence: 0.4,
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
     * Get domain alias map (for debugging/display).
     */
    getDomainAliases(): Record<string, string[]> {
      return { ...DOMAIN_ALIASES };
    },

    /**
     * Get the configuration.
     */
    getConfig(): DomainTransferConfig {
      return { minOrgsForPrior, maxPriorWeight, priorDecay, semanticMatchThreshold };
    },
  };
}
