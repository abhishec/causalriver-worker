/**
 * Model Router — selects the optimal Claude model for each SE-aaS domain.
 *
 * Philosophy (mirrors Perplexity Computer's multi-model approach):
 * - Light data domains: Haiku (fast, cheap, sufficient for structured queries)
 * - Code analysis domains: Sonnet (quality reasoning required)
 * - Complex generation domains: Sonnet (output quality matters)
 *
 * Brain IQ gate (layered on top of domain weights):
 * - IQ < 10  → brain not ready → downgrade to Haiku regardless of domain weight
 * - IQ 10-29 → brain learning → use standard domain-based selection
 * - IQ >= 30 → brain ready    → Sonnet for heavy domains (unlock full reasoning)
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
  // Brain agents / connectors — structured, low-complexity
  'context-agent',
  'context-compress',
  'mem0-extract',
  'document-absorb',
  'cc-learning',
  'slack-process',
  'connector-analyze',
  'pm-aas-structured',
  'aas-artifact-simple',
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
  // Brain agents / orchestration — reasoning, synthesis, generation
  'copilot-complex',
  'agent-compose',
  'recovery-agent',
  'self-moa',
  'aas-artifact-complex',
  'pm-aas-analysis',
  'workspace-orchestrate',
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
  /** Set when Brain IQ is below the minimum viable threshold */
  brainCaveat?: string;
}

/**
 * Route model with Brain IQ as an additional gating signal.
 *
 * Brain IQ thresholds:
 *   IQ < 10  → brain not ready → force Haiku + attach caveat to caller
 *   IQ 10-29 → brain learning  → use standard domain-based selection
 *   IQ >= 30 → brain ready     → Sonnet for heavy domains (no downgrade)
 */
export function routeModelWithIq(domainType: string, brainIq: number): ModelRoutingDecision {
  const domainWeight = HAIKU_DOMAINS.has(domainType) ? 'light' : 'heavy';

  // IQ gate: brain not ready — downgrade to Haiku regardless of domain
  if (brainIq < 10) {
    return {
      model: 'claude-haiku-4-5-20251001',
      displayName: getModelDisplayName('claude-haiku-4-5-20251001'),
      domainType,
      rationale: `Brain IQ ${brainIq} is below minimum threshold (10) — using Haiku until brain is ready`,
      brainCaveat: `Brain IQ is low (${brainIq}). Connect more data sources for better results.`,
    };
  }

  // IQ 10-29: brain learning — use standard domain selection
  if (brainIq < 30) {
    const model = selectModelForDomain(domainType);
    return {
      model,
      displayName: getModelDisplayName(model),
      domainType,
      rationale: domainWeight === 'light'
        ? 'Structured data query — Haiku is fast and sufficient'
        : 'Code/generation task — Sonnet for quality reasoning',
    };
  }

  // IQ >= 30: brain ready — use Sonnet for heavy domains, Haiku for light
  const model = domainWeight === 'heavy' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  return {
    model,
    displayName: getModelDisplayName(model),
    domainType,
    rationale: domainWeight === 'heavy'
      ? `Brain IQ ${brainIq} >= 30 — unlocking full Sonnet for heavy domain`
      : 'Structured data query — Haiku is fast and sufficient',
  };
}

/**
 * Legacy route function (no Brain IQ signal). Kept for callers that don't
 * have access to Brain IQ at call time.
 */
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
 * Route model for non-SE-aaS call types.
 * Used by brain agents, copilot, and other LLM callers.
 */
export function routeCallType(callType: string, brainIq = 50): ModelRoutingDecision {
  return routeModelWithIq(callType, brainIq);
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
