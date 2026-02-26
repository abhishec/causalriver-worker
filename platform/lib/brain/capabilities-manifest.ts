/**
 * Capabilities Manifest
 * ======================
 *
 * Static + dynamic manifest of everything an AI worker can use.
 * Used by the Recovery Agent to find alternative execution paths when a domain fails.
 *
 * Three layers:
 *  1. Static domain registry — what each domain does, what data it needs, what fails it
 *  2. Connector capabilities — what each connector integration provides
 *  3. Brain features — memory, RL, case-log, and other cognitive services available
 *
 * RecoveryStrategy entries describe known fallback patterns so the recovery agent
 * can pick the best one without asking Claude for every simple case.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface DomainCapability {
  /** Domain identifier (matches DOMAIN_MAP keys in domain-executor.ts) */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this domain produces */
  description: string;
  /** DB tables this domain reads from */
  requiredTables: string[];
  /** Connector integrations that enrich this domain (optional) */
  optionalConnectors: string[];
  /** What this domain returns on success */
  outputShape: string;
  /** Common failure modes */
  failureModes: string[];
  /** Other domain IDs that can partially answer the same questions */
  alternatives: string[];
  /** Whether this domain requires an LLM call (Claude API) */
  requiresLLM: boolean;
  /** Whether this is a synchronous domain (fast) or async (may time out) */
  sync: boolean;
}

export interface ConnectorCapability {
  /** Connector slug (e.g. "github", "jira") */
  id: string;
  /** Display name */
  name: string;
  /** What data this connector provides */
  provides: string[];
  /** Which domains are enriched when this connector is connected */
  enrichesDomains: string[];
  /** DB tables populated by this connector */
  tables: string[];
}

export interface RecoveryStrategy {
  /** Unique strategy identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** Domain failure modes this strategy addresses */
  applicableFailures: string[];
  /** Domain IDs this strategy applies to */
  applicableDomains: string[];
  /** The action to take */
  action: 'alternative-domain' | 'simplified-query' | 'graceful-degradation';
  /** If action is 'alternative-domain', which domain to try */
  targetDomain?: string;
  /** Confidence level this strategy will succeed (0–1) */
  baseConfidence: number;
}

export interface CapabilityManifest {
  domains: DomainCapability[];
  connectors: ConnectorCapability[];
  brainFeatures: string[];
  recoveryStrategies: RecoveryStrategy[];
}

// ── Static Domain Registry ─────────────────────────────────────────────────

export const DOMAIN_CAPABILITIES: DomainCapability[] = [
  {
    id: "pod-match",
    name: "Pod Match",
    description: "Matches engineers to pods based on skills, velocity, and engagement history. Returns top pod recommendation with confidence score.",
    requiredTables: ["pod_match_history", "connector_signals", "engagements"],
    optionalConnectors: ["github", "jira"],
    outputShape: "{ top_recommendation: string, confidence: number, alternatives: string[], reasoning: string }",
    failureModes: [
      "No pod_match_history for org",
      "No engagements in active state",
      "Missing connector_signals data",
    ],
    alternatives: ["delivery-intelligence", "early-warning"],
    requiresLLM: false,
    sync: true,
  },
  {
    id: "early-warning",
    name: "Early Warning",
    description: "Detects velocity collapse, bottlenecks, and flight-risk signals from engineer health snapshots and engagement scores.",
    requiredTables: ["engineer_health_snapshots", "engagement_health_scores", "engagements"],
    optionalConnectors: ["github", "jira", "slack"],
    outputShape: "{ alerts: Alert[], velocity: number, flightRisks: string[], bottlenecks: string[] }",
    failureModes: [
      "No engineer_health_snapshots for org",
      "No recent engagement_health_scores",
      "Stale data (>7 days old)",
    ],
    alternatives: ["scope-creep", "delivery-intelligence"],
    requiresLLM: false,
    sync: true,
  },
  {
    id: "scope-creep",
    name: "Scope Creep Detector",
    description: "Identifies scope expansion alerts from delivery tracker data. Returns scope creep alerts with severity and affected engagements.",
    requiredTables: ["scope_creep_alerts", "engagements"],
    optionalConnectors: ["jira"],
    outputShape: "{ alerts: ScopeAlert[], totalAffected: number, highSeverityCount: number }",
    failureModes: [
      "No scope_creep_alerts for org",
      "scope_creep_alerts table not yet populated",
    ],
    alternatives: ["early-warning", "delivery-intelligence"],
    requiresLLM: false,
    sync: true,
  },
  {
    id: "delivery-intelligence",
    name: "Delivery Intelligence",
    description: "Full delivery health snapshot combining engagement health scores, pod status, and velocity metrics.",
    requiredTables: ["engagement_health_latest", "engagement_health_scores", "engagements"],
    optionalConnectors: ["github", "jira"],
    outputShape: "{ healthScore: number, engagements: EngagementHealth[], trends: Trend[] }",
    failureModes: [
      "engagement_health_latest view returns empty",
      "No active engagements",
    ],
    alternatives: ["pod-match", "early-warning"],
    requiresLLM: false,
    sync: true,
  },
  {
    id: "pr-review",
    name: "PR Review",
    description: "AI-powered pull request review with code quality analysis, risk scoring, and actionable inline suggestions.",
    requiredTables: ["se_aas_artifacts"],
    optionalConnectors: ["github"],
    outputShape: "{ summary: string, riskScore: number, suggestions: Suggestion[], approved: boolean }",
    failureModes: [
      "No GitHub connector connected",
      "PR diff too large for context window",
      "Rate limited by GitHub API",
    ],
    alternatives: ["impact-analysis", "codebase-qa"],
    requiresLLM: true,
    sync: false,
  },
  {
    id: "tdd-code-generator",
    name: "TDD Code Generator",
    description: "Generates test-driven code: writes failing tests first, then implementation that makes them pass.",
    requiredTables: ["se_aas_artifacts"],
    optionalConnectors: ["github"],
    outputShape: "{ tests: string, implementation: string, coverage: number, narrative: string }",
    failureModes: [
      "Ambiguous requirements",
      "Missing language/framework context",
      "LLM timeout on complex generation",
    ],
    alternatives: ["test-data-generator", "boilerplate-scaffold"],
    requiresLLM: true,
    sync: false,
  },
  {
    id: "incident-diagnosis",
    name: "Incident Diagnosis",
    description: "Root cause analysis for production incidents using log patterns, error traces, and causal graph reasoning.",
    requiredTables: ["se_aas_artifacts", "causal_relationships_statistical"],
    optionalConnectors: ["datadog", "sentry", "pagerduty"],
    outputShape: "{ rootCause: string, confidence: number, remediation: string[], timeline: Event[] }",
    failureModes: [
      "No log data available",
      "Incident already resolved (no active signals)",
      "Missing observability connector",
    ],
    alternatives: ["log-query", "impact-analysis"],
    requiresLLM: true,
    sync: false,
  },
  {
    id: "impact-analysis",
    name: "Impact Analysis",
    description: "Analyses the blast radius of a code change: what systems, users, and SLAs are affected.",
    requiredTables: ["se_aas_artifacts", "causal_relationships_statistical"],
    optionalConnectors: ["github", "jira"],
    outputShape: "{ riskScore: number, affectedSystems: string[], affectedUsers: number, slaImpact: string }",
    failureModes: [
      "No dependency graph available",
      "Missing GitHub connector for code context",
    ],
    alternatives: ["pr-review", "incident-diagnosis"],
    requiresLLM: true,
    sync: false,
  },
  {
    id: "sql-analyzer",
    name: "SQL Analyzer",
    description: "Analyzes SQL queries for performance issues, missing indexes, anti-patterns, and security risks.",
    requiredTables: [],
    optionalConnectors: [],
    outputShape: "{ issues: SQLIssue[], suggestions: string[], estimatedImprovement: string }",
    failureModes: [
      "No SQL provided in payload",
      "Dialect not supported",
    ],
    alternatives: ["data-lineage"],
    requiresLLM: true,
    sync: true,
  },
  {
    id: "test-data-generator",
    name: "Test Data Generator",
    description: "Generates realistic synthetic test data matching a provided schema or sample.",
    requiredTables: [],
    optionalConnectors: [],
    outputShape: "{ data: Record<string,unknown>[], schema: Schema, rowCount: number }",
    failureModes: [
      "No schema provided",
      "Invalid schema format",
    ],
    alternatives: ["tdd-code-generator"],
    requiresLLM: true,
    sync: true,
  },
  {
    id: "design-doc-generator",
    name: "Design Doc Generator",
    description: "Generates technical design documents from a feature description, including architecture diagrams and trade-off analysis.",
    requiredTables: ["se_aas_artifacts"],
    optionalConnectors: ["github", "confluence"],
    outputShape: "{ document: string, sections: Section[], diagrams: string[] }",
    failureModes: [
      "Insufficient context about the system",
      "LLM timeout on long documents",
    ],
    alternatives: ["architecture-extractor", "codebase-qa"],
    requiresLLM: true,
    sync: false,
  },
  {
    id: "codebase-qa",
    name: "Codebase Q&A",
    description: "Answers questions about a codebase using the brain's code intelligence layer.",
    requiredTables: ["se_aas_artifacts"],
    optionalConnectors: ["github"],
    outputShape: "{ answer: string, codeReferences: CodeRef[], confidence: number }",
    failureModes: [
      "No GitHub connector",
      "No indexed codebase for the branch",
      "Question too vague",
    ],
    alternatives: ["design-doc-generator", "architecture-extractor"],
    requiresLLM: true,
    sync: false,
  },
  {
    id: "architecture-extractor",
    name: "Architecture Extractor",
    description: "Extracts and visualizes the architecture of a codebase: services, dependencies, data flows.",
    requiredTables: ["se_aas_artifacts"],
    optionalConnectors: ["github"],
    outputShape: "{ components: Component[], relationships: Relationship[], diagram: string }",
    failureModes: [
      "No GitHub connector",
      "Monorepo too large to index in one pass",
    ],
    alternatives: ["codebase-qa", "design-doc-generator"],
    requiresLLM: true,
    sync: false,
  },
];

// ── Connector Capabilities ─────────────────────────────────────────────────

export const CONNECTOR_CAPABILITIES: ConnectorCapability[] = [
  {
    id: "github",
    name: "GitHub",
    provides: ["Pull request diffs", "Code context", "Commit history", "Branch structure", "Repository metadata"],
    enrichesDomains: ["pr-review", "tdd-code-generator", "impact-analysis", "codebase-qa", "architecture-extractor", "design-doc-generator"],
    tables: ["connector_signals", "se_aas_artifacts"],
  },
  {
    id: "jira",
    name: "Jira",
    provides: ["Issue tracker data", "Sprint velocity", "Scope change history", "Ticket metadata"],
    enrichesDomains: ["early-warning", "scope-creep", "impact-analysis", "pod-match"],
    tables: ["connector_signals", "scope_creep_alerts"],
  },
  {
    id: "slack",
    name: "Slack",
    provides: ["Team communication signals", "Sentiment analysis", "Response time metrics"],
    enrichesDomains: ["early-warning", "pod-match"],
    tables: ["connector_signals"],
  },
  {
    id: "datadog",
    name: "Datadog",
    provides: ["Infrastructure metrics", "APM traces", "Log streams", "Alerts"],
    enrichesDomains: ["incident-diagnosis", "log-query"],
    tables: ["connector_signals"],
  },
  {
    id: "sentry",
    name: "Sentry",
    provides: ["Error tracking", "Stack traces", "Error frequency", "Affected users"],
    enrichesDomains: ["incident-diagnosis"],
    tables: ["connector_signals"],
  },
];

// ── Brain Features ─────────────────────────────────────────────────────────

export const BRAIN_FEATURES: string[] = [
  "causal-graph: Bayesian causal relationships between actions and outcomes",
  "rl-closed-loop: Reinforcement learning from task outcomes (quality > 0.7 = dopamine signal)",
  "case-log-priming: Injects learned patterns from past executions into agent context",
  "brain-context-mesh: Unified context assembly from causal edges, patterns, and entity links",
  "brain-feedback-bus: Cross-domain signal propagation for learning",
  "federated-learning: Org-to-CORE delta promotion for cross-tenant knowledge sharing",
  "leap-context: Deep brain reasoning from cognitive sleep cycles (curiosity hypotheses)",
  "entity-links: Cross-system connections (PR → Jira → Slack → Deploy)",
  "prediction-records: Tracks predicted vs actual outcomes for RL verification",
  "evolution-snapshots: Daily accuracy tracking for the org brain",
];

// ── Recovery Strategies ────────────────────────────────────────────────────

export const RECOVERY_STRATEGIES: RecoveryStrategy[] = [
  {
    id: "delivery-intel-fallback",
    description: "When pod-match fails due to missing history, fall back to delivery-intelligence for a broader health view",
    applicableFailures: ["No pod_match_history for org", "empty result"],
    applicableDomains: ["pod-match"],
    action: "alternative-domain",
    targetDomain: "delivery-intelligence",
    baseConfidence: 0.75,
  },
  {
    id: "early-warning-fallback",
    description: "When scope-creep has no alerts, try early-warning for velocity signals instead",
    applicableFailures: ["No scope_creep_alerts for org", "empty result"],
    applicableDomains: ["scope-creep"],
    action: "alternative-domain",
    targetDomain: "early-warning",
    baseConfidence: 0.70,
  },
  {
    id: "pod-match-fallback",
    description: "When delivery-intelligence returns empty, try pod-match for narrower recommendation",
    applicableFailures: ["empty result", "engagement_health_latest view returns empty"],
    applicableDomains: ["delivery-intelligence"],
    action: "alternative-domain",
    targetDomain: "pod-match",
    baseConfidence: 0.65,
  },
  {
    id: "impact-analysis-for-pr",
    description: "When pr-review fails due to missing GitHub connector, use impact-analysis for risk scoring",
    applicableFailures: ["No GitHub connector connected", "connector not available"],
    applicableDomains: ["pr-review"],
    action: "alternative-domain",
    targetDomain: "impact-analysis",
    baseConfidence: 0.60,
  },
  {
    id: "log-query-for-incident",
    description: "When incident-diagnosis fails due to missing observability connector, use log-query",
    applicableFailures: ["Missing observability connector", "No log data available"],
    applicableDomains: ["incident-diagnosis"],
    action: "alternative-domain",
    targetDomain: "log-query",
    baseConfidence: 0.55,
  },
  {
    id: "codebase-qa-for-arch",
    description: "When architecture-extractor fails due to repo size, use codebase-qa for targeted answers",
    applicableFailures: ["Monorepo too large", "context window", "timeout"],
    applicableDomains: ["architecture-extractor"],
    action: "alternative-domain",
    targetDomain: "codebase-qa",
    baseConfidence: 0.65,
  },
  {
    id: "graceful-no-data",
    description: "When no data is available for a delivery domain, return a helpful explanation of what data is needed",
    applicableFailures: ["empty result", "no data", "table empty"],
    applicableDomains: ["pod-match", "early-warning", "scope-creep", "delivery-intelligence"],
    action: "graceful-degradation",
    baseConfidence: 0.95,
  },
  {
    id: "llm-timeout-simplify",
    description: "When an LLM-powered domain times out, re-run with a simplified payload",
    applicableFailures: ["timeout", "context window exceeded", "rate limit"],
    applicableDomains: [
      "tdd-code-generator", "pr-review", "incident-diagnosis",
      "design-doc-generator", "architecture-extractor", "codebase-qa",
    ],
    action: "simplified-query",
    baseConfidence: 0.60,
  },
];

// ── The Manifest ──────────────────────────────────────────────────────────

export const CAPABILITIES_MANIFEST: CapabilityManifest = {
  domains: DOMAIN_CAPABILITIES,
  connectors: CONNECTOR_CAPABILITIES,
  brainFeatures: BRAIN_FEATURES,
  recoveryStrategies: RECOVERY_STRATEGIES,
};

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Find a domain capability by its ID.
 */
export function getDomainCapability(domainId: string): DomainCapability | null {
  return DOMAIN_CAPABILITIES.find(d => d.id === domainId) ?? null;
}

/**
 * Find recovery strategies that apply to a given domain + failure reason.
 * Returns strategies sorted by baseConfidence descending.
 */
export function findApplicableStrategies(
  domainId: string,
  failureReason: string,
): RecoveryStrategy[] {
  const lowerFailure = failureReason.toLowerCase();

  return RECOVERY_STRATEGIES
    .filter(s => {
      const domainMatch = s.applicableDomains.includes(domainId) || s.applicableDomains.includes('*');
      const failureMatch = s.applicableFailures.some(f => lowerFailure.includes(f.toLowerCase()));
      return domainMatch && failureMatch;
    })
    .sort((a, b) => b.baseConfidence - a.baseConfidence);
}

/**
 * Get all alternative domains for a given domain.
 * Excludes the original domain and sorts by whether they share required tables.
 */
export function getAlternativeDomains(domainId: string): DomainCapability[] {
  const origin = getDomainCapability(domainId);
  if (!origin) return [];

  return origin.alternatives
    .map(altId => getDomainCapability(altId))
    .filter((d): d is DomainCapability => d !== null);
}

/**
 * Produce a compact manifest summary for LLM prompts.
 * Keeps the prompt small by only including the most useful fields.
 */
export function buildManifestSummary(excludeDomainId?: string): string {
  const domains = DOMAIN_CAPABILITIES
    .filter(d => d.id !== excludeDomainId)
    .map(d => `- ${d.id}: ${d.description.slice(0, 120)}`)
    .join('\n');

  const strategies = RECOVERY_STRATEGIES
    .filter(s => !excludeDomainId || s.applicableDomains.includes(excludeDomainId))
    .map(s => `- ${s.id} (${s.action}): ${s.description.slice(0, 100)}`)
    .join('\n');

  return `AVAILABLE DOMAINS:\n${domains}\n\nRECOVERY STRATEGIES:\n${strategies}`;
}
