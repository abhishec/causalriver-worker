/**
 * Trained Knowledge Querier
 *
 * THIS IS THE MISSING PIECE: After training packs are ingested, this module
 * lets you QUERY the trained knowledge to prove the brain actually learned.
 *
 * It bridges the gap between:
 *   - Training (data goes IN)
 *   - Inference (knowledge comes BACK OUT)
 *
 * Provides:
 *   1. Causal path queries: "What causes X?" / "What does Y affect?"
 *   2. Rule matching: "Which rules fire for this entity state?"
 *   3. Pattern retrieval: "What patterns exist in domain Z?"
 *   4. Impact estimation: "If I change A, what cascades?"
 *   5. Knowledge summary: "What did the brain learn from these packs?"
 */

import type { CausalDAG, CausalEdge, CausalNode, CausalPath } from '../causality/causal-graph-builder';
import type { DiscoveredPattern } from './pattern-detector';

// ============================================================================
// TYPES
// ============================================================================

export interface KnowledgeQuery {
  type: 'causes_of' | 'effects_of' | 'path' | 'rules_for' | 'patterns_in' | 'impact' | 'summary';
  domain?: string;
  sourceDomain?: string;
  targetDomain?: string;
  entityState?: Record<string, unknown>;
  maxDepth?: number;
}

export interface CausalChainResult {
  source: string;
  target: string;
  effectSize: number;
  lagDays: number;
  metric?: string;
}

export interface CausalQueryResult {
  query: KnowledgeQuery;
  directCauses: CausalChainResult[];
  directEffects: CausalChainResult[];
  cascadePaths: CascadePathResult[];
  matchedRules: MatchedRule[];
  relevantPatterns: PatternResult[];
  impactEstimate?: ImpactEstimate;
  summary: string;
}

export interface CascadePathResult {
  path: string[];
  totalEffectSize: number;
  cumulativeLagDays: number;
  probability: number;
  explanation: string;
}

export interface MatchedRule {
  title: string;
  naturalLanguage: string;
  triggered: boolean;
  conditions: string[];
}

export interface PatternResult {
  name: string;
  description: string;
  significance: number;
  domains: string[];
}

export interface ImpactEstimate {
  affectedDomains: string[];
  maxCascadeDepth: number;
  totalEffectMagnitude: number;
  timeToFullCascade: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface KnowledgeSummary {
  totalDomains: number;
  domains: string[];
  totalEdges: number;
  totalRules: number;
  totalPatterns: number;
  strongestRelationships: CausalChainResult[];
  mostInfluentialDomains: Array<{ domain: string; influence: number; pageRank: number }>;
  rootCauses: string[];
  terminalEffects: string[];
  cascadeChains: CascadePathResult[];
  narrative: string;
}

// ============================================================================
// TYPES FOR BRAIN GRAMMAR RULES (simplified for matching)
// ============================================================================

interface BrainGrammarRule {
  id?: string;
  title: string;
  description?: string;
  entity_type: string;
  when: RuleCondition;
  then: unknown[];
  is_active: boolean;
  natural_language?: string;
  naturalLanguage?: string;
}

interface RuleCondition {
  logic: 'AND' | 'OR';
  conditions: Array<{
    field: string;
    operator: string;
    value: unknown;
  }>;
}

// ============================================================================
// MAIN QUERIER
// ============================================================================

export function createTrainedKnowledgeQuerier(
  graph: CausalDAG,
  patterns: DiscoveredPattern[],
  rules: BrainGrammarRule[],
) {
  /**
   * Find all direct causes of a domain
   */
  function findDirectCauses(domain: string): CausalChainResult[] {
    return graph.edges
      .filter(e => e.target === domain && e.isActive)
      .map(e => ({
        source: e.source,
        target: e.target,
        effectSize: e.effectSize,
        lagDays: e.lagDays,
      }))
      .sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize));
  }

  /**
   * Find all direct effects of a domain
   */
  function findDirectEffects(domain: string): CausalChainResult[] {
    return graph.edges
      .filter(e => e.source === domain && e.isActive)
      .map(e => ({
        source: e.source,
        target: e.target,
        effectSize: e.effectSize,
        lagDays: e.lagDays,
      }))
      .sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize));
  }

  /**
   * Find all cascade paths between two domains using DFS
   */
  function findCascadePaths(
    source: string,
    target: string,
    maxDepth: number = 5,
  ): CascadePathResult[] {
    const results: CascadePathResult[] = [];

    function dfs(
      current: string,
      path: string[],
      totalEffect: number,
      totalLag: number,
      probability: number,
    ): void {
      if (path.length > maxDepth + 1) return;

      if (current === target && path.length > 1) {
        results.push({
          path: [...path],
          totalEffectSize: totalEffect,
          cumulativeLagDays: totalLag,
          probability,
          explanation: `${path.join(' → ')} (effect: ${(totalEffect * 100).toFixed(1)}%, lag: ${totalLag}d)`,
        });
        return;
      }

      for (const edge of graph.edges) {
        if (edge.source !== current || !edge.isActive) continue;
        if (path.includes(edge.target)) continue; // prevent cycles

        dfs(
          edge.target,
          [...path, edge.target],
          totalEffect * edge.effectSize,
          totalLag + edge.lagDays,
          probability * (1 - edge.pValue),
        );
      }
    }

    dfs(source, [source], 1, 0, 1);
    return results.sort((a, b) => Math.abs(b.totalEffectSize) - Math.abs(a.totalEffectSize));
  }

  /**
   * Match rules against an entity state
   */
  function matchRules(entityState: Record<string, unknown>, entityType?: string): MatchedRule[] {
    const matched: MatchedRule[] = [];

    for (const rule of rules) {
      if (!rule.is_active) continue;
      if (entityType && rule.entity_type !== entityType) continue;

      const conditions: string[] = [];
      let allMet = true;

      if (rule.when && rule.when.conditions) {
        for (const cond of rule.when.conditions) {
          const value = getNestedValue(entityState, cond.field);
          const condMet = evaluateCondition(value, cond.operator, cond.value);
          conditions.push(`${cond.field} ${cond.operator} ${cond.value} → ${condMet ? '✓' : '✗'}`);
          if (!condMet) allMet = false;
        }
      }

      // For AND logic, all conditions must be met
      const triggered = rule.when.logic === 'AND' ? allMet : conditions.some(c => c.includes('✓'));

      matched.push({
        title: rule.title,
        naturalLanguage: rule.natural_language || rule.naturalLanguage || rule.description || '',
        triggered,
        conditions,
      });
    }

    return matched;
  }

  /**
   * Find patterns relevant to a domain
   */
  function findPatternsForDomain(domain: string): PatternResult[] {
    return patterns
      .filter(p => p.domainsInvolved.includes(domain))
      .map(p => ({
        name: p.name,
        description: p.description || p.naturalLanguage,
        significance: 1 - (p.evidence?.pValue ?? 1),
        domains: p.domainsInvolved,
      }))
      .sort((a, b) => b.significance - a.significance);
  }

  /**
   * Estimate cascade impact from a domain change
   */
  function estimateImpact(domain: string, maxDepth: number = 4): ImpactEstimate {
    const visited = new Set<string>();
    const queue: Array<{ node: string; depth: number; effect: number }> = [
      { node: domain, depth: 0, effect: 1 },
    ];
    let maxCascadeDepth = 0;
    let totalMagnitude = 0;
    let maxLag = 0;

    while (queue.length > 0) {
      const { node, depth, effect } = queue.shift()!;
      if (visited.has(node) || depth > maxDepth) continue;
      visited.add(node);

      if (depth > maxCascadeDepth) maxCascadeDepth = depth;
      totalMagnitude += Math.abs(effect);

      for (const edge of graph.edges) {
        if (edge.source !== node || !edge.isActive) continue;
        if (visited.has(edge.target)) continue;

        maxLag = Math.max(maxLag, edge.lagDays);
        queue.push({
          node: edge.target,
          depth: depth + 1,
          effect: effect * edge.effectSize,
        });
      }
    }

    const affectedDomains = Array.from(visited).filter(d => d !== domain);
    const riskLevel =
      affectedDomains.length >= 5 ? 'critical' :
      affectedDomains.length >= 3 ? 'high' :
      affectedDomains.length >= 1 ? 'medium' : 'low';

    return {
      affectedDomains,
      maxCascadeDepth,
      totalEffectMagnitude: totalMagnitude,
      timeToFullCascade: maxLag,
      riskLevel,
    };
  }

  /**
   * Generate a comprehensive knowledge summary
   */
  function summarize(): KnowledgeSummary {
    const domains = new Set<string>();
    for (const edge of graph.edges) {
      if (!edge.isActive) continue;
      domains.add(edge.source);
      domains.add(edge.target);
    }

    const domainList = Array.from(domains);

    // Find most influential domains by PageRank
    const mostInfluential = Array.from(graph.nodes.values())
      .sort((a, b) => b.pageRank - a.pageRank)
      .slice(0, 5)
      .map(n => ({
        domain: n.id,
        influence: n.totalCausalInfluence,
        pageRank: n.pageRank,
      }));

    // Find root causes (no inbound edges)
    const rootCauses = Array.from(graph.nodes.values())
      .filter(n => n.inDegree === 0 && n.outDegree > 0)
      .map(n => n.id);

    // Find terminal effects (no outbound edges)
    const terminalEffects = Array.from(graph.nodes.values())
      .filter(n => n.outDegree === 0 && n.inDegree > 0)
      .map(n => n.id);

    // Strongest relationships
    const strongestRelationships = graph.edges
      .filter(e => e.isActive)
      .sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize))
      .slice(0, 10)
      .map(e => ({
        source: e.source,
        target: e.target,
        effectSize: e.effectSize,
        lagDays: e.lagDays,
      }));

    // Find interesting cascade chains
    const cascadeChains: CascadePathResult[] = [];
    for (const source of rootCauses.slice(0, 3)) {
      for (const target of terminalEffects.slice(0, 3)) {
        const paths = findCascadePaths(source, target, 4);
        cascadeChains.push(...paths.slice(0, 2));
      }
    }

    // Build narrative
    const narrative = buildNarrative(
      domainList,
      strongestRelationships,
      mostInfluential,
      rootCauses,
      terminalEffects,
      rules.length,
      patterns.length,
    );

    return {
      totalDomains: domains.size,
      domains: domainList,
      totalEdges: graph.edges.filter(e => e.isActive).length,
      totalRules: rules.length,
      totalPatterns: patterns.length,
      strongestRelationships,
      mostInfluentialDomains: mostInfluential,
      rootCauses,
      terminalEffects,
      cascadeChains,
      narrative,
    };
  }

  /**
   * Full query — combines all query types
   */
  function query(q: KnowledgeQuery): CausalQueryResult {
    const domain = q.domain || q.sourceDomain || '';

    const directCauses = q.type === 'causes_of' || q.type === 'summary'
      ? findDirectCauses(domain)
      : [];

    const directEffects = q.type === 'effects_of' || q.type === 'impact' || q.type === 'summary'
      ? findDirectEffects(domain)
      : [];

    const cascadePaths = q.type === 'path' && q.sourceDomain && q.targetDomain
      ? findCascadePaths(q.sourceDomain, q.targetDomain, q.maxDepth)
      : [];

    const matchedRules = q.type === 'rules_for' && q.entityState
      ? matchRules(q.entityState)
      : [];

    const relevantPatterns = q.type === 'patterns_in'
      ? findPatternsForDomain(domain)
      : [];

    const impactEstimate = q.type === 'impact'
      ? estimateImpact(domain, q.maxDepth)
      : undefined;

    const summary = buildQuerySummary(q, directCauses, directEffects, cascadePaths, matchedRules, relevantPatterns, impactEstimate);

    return {
      query: q,
      directCauses,
      directEffects,
      cascadePaths,
      matchedRules,
      relevantPatterns,
      impactEstimate,
      summary,
    };
  }

  return {
    findDirectCauses,
    findDirectEffects,
    findCascadePaths,
    matchRules,
    findPatternsForDomain,
    estimateImpact,
    summarize,
    query,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(value: unknown, operator: string, target: unknown): boolean {
  if (value === undefined || value === null) return false;
  const numValue = typeof value === 'number' ? value : Number(value);
  const numTarget = typeof target === 'number' ? target : Number(target);

  switch (operator) {
    case 'greater_than': return numValue > numTarget;
    case 'less_than': return numValue < numTarget;
    case 'equals': return value === target;
    case 'not_equals': return value !== target;
    case 'greater_than_or_equal': return numValue >= numTarget;
    case 'less_than_or_equal': return numValue <= numTarget;
    default: return false;
  }
}

function buildNarrative(
  domains: string[],
  strongest: CausalChainResult[],
  influential: Array<{ domain: string; influence: number }>,
  roots: string[],
  terminals: string[],
  ruleCount: number,
  patternCount: number,
): string {
  const parts: string[] = [];

  parts.push(`The brain has learned causal relationships across ${domains.length} domains: ${domains.join(', ')}.`);

  if (strongest.length > 0) {
    const top = strongest[0];
    parts.push(`The strongest relationship is ${top.source} → ${top.target} (effect: ${(top.effectSize * 100).toFixed(0)}%, lag: ${top.lagDays}d).`);
  }

  if (influential.length > 0) {
    parts.push(`The most influential domain is "${influential[0].domain}" — changes here cascade most widely.`);
  }

  if (roots.length > 0) {
    parts.push(`Root causes (upstream drivers with no inbound edges): ${roots.join(', ')}.`);
  }

  if (terminals.length > 0) {
    parts.push(`Terminal effects (downstream outcomes with no outbound edges): ${terminals.join(', ')}.`);
  }

  parts.push(`${ruleCount} business rules are active for automated alerting.`);
  parts.push(`${patternCount} statistically significant patterns are registered.`);

  return parts.join(' ');
}

function buildQuerySummary(
  q: KnowledgeQuery,
  causes: CausalChainResult[],
  effects: CausalChainResult[],
  paths: CascadePathResult[],
  rules: MatchedRule[],
  patterns: PatternResult[],
  impact?: ImpactEstimate,
): string {
  const parts: string[] = [];

  if (causes.length > 0) {
    parts.push(`${causes.length} direct cause(s) of "${q.domain}": ${causes.map(c => `${c.source} (${(c.effectSize * 100).toFixed(0)}%)`).join(', ')}.`);
  }

  if (effects.length > 0) {
    parts.push(`${effects.length} direct effect(s) from "${q.domain}": ${effects.map(e => `→ ${e.target} (${(e.effectSize * 100).toFixed(0)}%)`).join(', ')}.`);
  }

  if (paths.length > 0) {
    parts.push(`${paths.length} cascade path(s) found: ${paths[0].explanation}.`);
  }

  const triggered = rules.filter(r => r.triggered);
  if (triggered.length > 0) {
    parts.push(`${triggered.length} rule(s) triggered: ${triggered.map(r => r.title).join(', ')}.`);
  }

  if (patterns.length > 0) {
    parts.push(`${patterns.length} pattern(s) in domain: ${patterns.map(p => p.name).join(', ')}.`);
  }

  if (impact) {
    parts.push(`Impact: ${impact.riskLevel} risk, affects ${impact.affectedDomains.length} domains, cascade depth ${impact.maxCascadeDepth}, full cascade in ${impact.timeToFullCascade}d.`);
  }

  return parts.join(' ') || 'No results found for this query.';
}

export type TrainedKnowledgeQuerier = ReturnType<typeof createTrainedKnowledgeQuerier>;
