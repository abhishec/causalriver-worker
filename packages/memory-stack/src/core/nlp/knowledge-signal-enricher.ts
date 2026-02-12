/**
 * Knowledge-Aware Signal Enricher — Dependency Intelligence Layer
 *
 * Enriches any connector signal with dependency graph context: which entities
 * are affected, downstream impact, risk scores, affected business domains.
 *
 * Brain Analog: The Angular Gyrus — responsible for making connections between
 * different types of information (visual, auditory, semantic). This enricher
 * connects structural knowledge (dependency graph) with real-time signals.
 */

import type { KnowledgeDependencyGraphInstance } from '../knowledge-dependency-graph';

// Interface for enrichable signal (same as signal-enricher)
export interface EnrichableSignal {
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface KnowledgeEnrichment {
  /** Entities mentioned/affected by this signal */
  knowledge_affected_entities: string[];
  /** Downstream dependents that could be impacted */
  knowledge_downstream_dependents: string[];
  /** Total impact radius (number of transitive dependents) */
  knowledge_impact_radius: number;
  /** Risk score 0-1 based on dependency analysis */
  knowledge_risk_score: number;
  /** Business domains affected by this change */
  knowledge_affected_domains: string[];
  /** Complexity metrics for affected entities */
  knowledge_complexity: {
    avgFanOut: number;
    maxInstability: number;
    hasCyclicDeps: boolean;
  };
  /** Business rules/logic associated with affected entities */
  knowledge_business_rules: string[];
}

export interface KnowledgeEnrichmentConfig {
  /** Which metadata fields contain entity IDs to look up */
  entityIdFields?: string[];
  /** Maximum entities to analyze (default 50, for scale) */
  maxEntities?: number;
  /** Minimum risk score to include in enrichment (default 0) */
  minRiskScore?: number;
}

// ── DOMAIN RULES ──
// Maps code patterns to business logic descriptions
const DOMAIN_RULES: Array<{
  pattern: RegExp;
  domain: string;
  businessRule: string;
}> = [
  { pattern: /auth|login|session|oauth|jwt/i, domain: 'security', businessRule: 'Authentication & access control' },
  { pattern: /payment|billing|invoice|stripe|subscription/i, domain: 'finance', businessRule: 'Payment processing & billing' },
  { pattern: /trial|freemium|upgrade|plan/i, domain: 'finance', businessRule: 'Trial & pricing rules' },
  { pattern: /rate.?limit|throttle|quota/i, domain: 'engineering', businessRule: 'Rate limiting & quotas' },
  { pattern: /gdpr|privacy|consent|data.?retention/i, domain: 'legal', businessRule: 'Data privacy & compliance' },
  { pattern: /notification|email|sms|webhook/i, domain: 'product', businessRule: 'Notification & messaging' },
  { pattern: /cache|ttl|expire|invalidat/i, domain: 'engineering', businessRule: 'Caching & data lifecycle' },
  { pattern: /permission|rbac|role|policy/i, domain: 'security', businessRule: 'Authorization & permissions' },
  { pattern: /checkout|cart|order/i, domain: 'finance', businessRule: 'E-commerce & checkout flow' },
  { pattern: /search|index|elasticsearch|algolia/i, domain: 'product', businessRule: 'Search & discovery' },
  { pattern: /analytics|tracking|telemetry/i, domain: 'product', businessRule: 'Analytics & telemetry' },
  { pattern: /queue|worker|job|cron/i, domain: 'engineering', businessRule: 'Background processing & jobs' },
  { pattern: /migration|schema|database/i, domain: 'engineering', businessRule: 'Data schema & migrations' },
  { pattern: /deploy|release|ci|cd/i, domain: 'engineering', businessRule: 'Deployment & release management' },
];

// Default fields that commonly contain entity IDs in signals
const DEFAULT_ENTITY_FIELDS = [
  'file_paths', 'file_path', 'files_changed',
  'line_item', 'line_items', 'related_accounts',
  'document_id', 'document_ids', 'references',
  'deal_id', 'products', 'service', 'services',
  'runbook_id', 'related_services',
];

/**
 * Extract entity IDs from signal metadata.
 */
export function extractEntityIds(
  signal: EnrichableSignal,
  fields: string[]
): string[] {
  const metadata = signal.metadata || {};
  const ids: string[] = [];

  for (const field of fields) {
    const value = metadata[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      ids.push(value.trim());
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim().length > 0) {
          ids.push(item.trim());
        }
      }
    }
  }

  return [...new Set(ids)]; // deduplicate
}

/**
 * Match entity IDs against business domain rules.
 */
export function matchBusinessRules(entityIds: string[]): string[] {
  const rules = new Set<string>();
  for (const id of entityIds) {
    for (const rule of DOMAIN_RULES) {
      if (rule.pattern.test(id)) {
        rules.add(rule.businessRule);
      }
    }
  }
  return Array.from(rules);
}

/**
 * Enrich a signal with knowledge graph dependency context.
 *
 * @param signal - The signal to enrich (mutated in place)
 * @param config.dependencyGraph - The knowledge dependency graph instance
 * @param config.entityIdFields - Which metadata fields contain entity IDs
 * @returns The enriched signal
 *
 * @example
 * ```typescript
 * // PR merged signal with file paths
 * enrichSignalWithKnowledgeGraph(signal, {
 *   dependencyGraph: graph,
 *   entityIdFields: ['file_paths'],
 * });
 * // signal.metadata now contains:
 * //   knowledge_affected_entities, knowledge_impact_radius, knowledge_risk_score, etc.
 * ```
 */
export function enrichSignalWithKnowledgeGraph<T extends EnrichableSignal>(
  signal: T,
  config: {
    dependencyGraph: KnowledgeDependencyGraphInstance;
    entityIdFields?: string[];
    maxEntities?: number;
    minRiskScore?: number;
  },
): T {
  const {
    dependencyGraph,
    entityIdFields = DEFAULT_ENTITY_FIELDS,
    maxEntities = 50,
    minRiskScore = 0,
  } = config;

  const entityIds = extractEntityIds(signal, entityIdFields).slice(0, maxEntities);
  if (entityIds.length === 0) return signal;

  // Aggregate impact across all entities
  const allDownstream = new Set<string>();
  const allDomains = new Set<string>();
  let maxRisk = 0;
  let totalFanOut = 0;
  let maxInstability = 0;
  let hasCyclic = false;
  let entityCount = 0;

  for (const entityId of entityIds) {
    const impact = dependencyGraph.analyzeImpact(entityId);

    if (impact.totalImpactRadius === 0 && impact.directDependents.length === 0) continue;
    entityCount++;

    const normEntityId = entityId.toLowerCase().trim();
    for (const dep of [...impact.directDependents, ...impact.transitiveDependents]) {
      // Add BOTH sides of the edge, excluding the query entity itself
      if (dep.sourceId !== normEntityId) allDownstream.add(dep.sourceId);
      if (dep.targetId !== normEntityId) allDownstream.add(dep.targetId);
    }

    for (const domain of impact.affectedDomains) {
      allDomains.add(domain);
    }

    if (impact.riskScore > maxRisk) maxRisk = impact.riskScore;

    const metrics = dependencyGraph.getComplexityMetrics(entityId);
    totalFanOut += metrics.fanOut;
    if (metrics.instability > maxInstability) maxInstability = metrics.instability;
  }

  // Check for cyclic dependencies among affected entities
  const cycles = dependencyGraph.detectCycles();
  if (cycles.count > 0) {
    for (const cycle of cycles.cycles) {
      if (entityIds.some(id => cycle.includes(id.toLowerCase()))) {
        hasCyclic = true;
        break;
      }
    }
  }

  // Match business rules
  const businessRules = matchBusinessRules(entityIds);

  // Only enrich if we found meaningful dependency data
  // entityCount === 0 means no entities had any impact (all unknown)
  if (entityCount === 0) return signal;
  if (maxRisk < minRiskScore && allDownstream.size === 0) return signal;

  const enrichment: KnowledgeEnrichment = {
    knowledge_affected_entities: entityIds,
    knowledge_downstream_dependents: Array.from(allDownstream).slice(0, 50),
    knowledge_impact_radius: allDownstream.size,
    knowledge_risk_score: Math.round(maxRisk * 100) / 100,
    knowledge_affected_domains: Array.from(allDomains),
    knowledge_complexity: {
      avgFanOut: entityCount > 0 ? Math.round((totalFanOut / entityCount) * 100) / 100 : 0,
      maxInstability: Math.round(maxInstability * 100) / 100,
      hasCyclicDeps: hasCyclic,
    },
    knowledge_business_rules: businessRules,
  };

  if (!signal.metadata) signal.metadata = {};
  Object.assign(signal.metadata, enrichment);

  return signal;
}

/**
 * Batch enrich multiple signals with knowledge graph context.
 */
export function enrichSignalsWithKnowledgeGraph<T extends EnrichableSignal>(
  signals: T[],
  config: {
    dependencyGraph: KnowledgeDependencyGraphInstance;
    entityIdFields?: string[];
    maxEntities?: number;
    minRiskScore?: number;
  },
): T[] {
  for (const signal of signals) {
    enrichSignalWithKnowledgeGraph(signal, config);
  }
  return signals;
}
