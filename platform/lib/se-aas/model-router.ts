/**
 * Model Router — selects the optimal Claude model for each SE-aaS domain.
 *
 * Philosophy (mirrors Perplexity Computer's multi-model approach):
 * - Light data domains: Haiku (fast, cheap, sufficient for structured queries)
 * - Code analysis domains: Sonnet (quality reasoning required)
 * - Complex generation domains: Sonnet (output quality matters)
 */

export type ClaudeModel =
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-4-6';

// Light domains: structured data lookup, pattern matching
const HAIKU_DOMAINS = new Set([
  'pod-match',
  'scope-creep',
  'early-warning',
  'delivery-intelligence',
]);

// Heavy domains: code understanding, generation, synthesis
const SONNET_DOMAINS = new Set([
  'pr-review',
  'codebase-qa',
  'sql-analyzer',
  'test-data-generator',
  'incident-diagnosis',
  'tdd-code-generator',
  'tdd',
  'design-doc-generator',
  'architecture-extractor',
  'impact-analysis',
  'test-case-generator',
  'data-lineage',
  'log-query',
  'dependency-upgrade',
  'performance-profiler',
  'dead-code-detector',
  'boilerplate-scaffold',
]);

export function selectModelForDomain(domainType: string): ClaudeModel {
  if (HAIKU_DOMAINS.has(domainType)) return 'claude-haiku-4-5-20251001';
  if (SONNET_DOMAINS.has(domainType)) return 'claude-sonnet-4-6';
  // Default: Sonnet for unknown domains (safe)
  return 'claude-sonnet-4-6';
}

export function getModelDisplayName(model: ClaudeModel): string {
  const names: Record<ClaudeModel, string> = {
    'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
    'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  };
  return names[model] ?? model;
}

export interface ModelRoutingDecision {
  model: ClaudeModel;
  displayName: string;
  domainType: string;
  rationale: string;
}

export function routeModel(domainType: string): ModelRoutingDecision {
  const model = selectModelForDomain(domainType);
  const isLight = HAIKU_DOMAINS.has(domainType);
  return {
    model,
    displayName: getModelDisplayName(model),
    domainType,
    rationale: isLight
      ? 'Structured data query — Haiku is fast and sufficient'
      : 'Code/generation task — Sonnet for quality reasoning',
  };
}

/**
 * All known SE-aaS domains for the routing table endpoint.
 */
export const ALL_SEAAS_DOMAINS: string[] = [
  // Light domains (Haiku)
  'pod-match',
  'scope-creep',
  'early-warning',
  'delivery-intelligence',
  // Heavy domains (Sonnet)
  'pr-review',
  'codebase-qa',
  'sql-analyzer',
  'test-data-generator',
  'incident-diagnosis',
  'tdd-code-generator',
  'tdd',
  'design-doc-generator',
  'architecture-extractor',
  'impact-analysis',
  'test-case-generator',
  'data-lineage',
  'log-query',
  'dependency-upgrade',
  'performance-profiler',
  'dead-code-detector',
  'boilerplate-scaffold',
];
