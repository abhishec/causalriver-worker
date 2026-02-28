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

// ── A2A Agent Card Skills ─────────────────────────────────────────────────
//
// The following section is the SINGLE SOURCE OF TRUTH for all skills exposed
// via the A2A agent card at GET /api/a2a/agent-card.
//
// When adding a new domain or service area, add an entry here — the agent card
// rebuilds dynamically from AGENT_SKILLS on every request.
//
// Service areas:
//   se-aas        — Software Engineering as a Service (code intelligence, delivery)
//   aas           — Accounting as a Service (bookkeeping, reconciliation, compliance)
//   pm-aas        — Product Management as a Service (roadmaps, sprint health, backlog)
//   process-engine — Business Process Automation (HR, procurement, finance workflows)
//   brain         — Brain meta-capabilities (RL, cognitive planning, orchestration)

export interface AgentSkill {
  id: string;          // kebab-case unique ID (used in A2A protocol)
  name: string;        // Human-readable name
  description: string; // What this skill does
  serviceArea: "se-aas" | "aas" | "pm-aas" | "process-engine" | "brain";
  inputModes: string[];  // e.g. ["text", "json"]
  outputModes: string[]; // e.g. ["text", "json"]
  tags: string[];
  examples?: string[];   // optional sample prompts for this skill
}

export const AGENT_SKILLS: AgentSkill[] = [
  // ── SE-aaS: Delivery Intelligence ─────────────────────────────────────────
  {
    id: "pod-match",
    name: "Pod Matching",
    description: "Match engineers to delivery pods based on skills, availability, and engagement requirements",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["delivery", "team", "matching", "staffing"],
    examples: [
      "Find the best pod for a fintech engagement starting Q2",
      "Which engineers are available for the Acme Corp project?",
    ],
  },
  {
    id: "early-warning",
    name: "Early Warning Detection",
    description: "Detect at-risk engineers and velocity bottlenecks — flight risk, overallocation, review burden — before they escalate",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["delivery", "risk", "velocity", "engineers"],
    examples: [
      "Which engineers are at flight risk this week?",
      "Show me velocity trends across all engagements",
    ],
  },
  {
    id: "scope-creep",
    name: "Scope Creep Detection",
    description: "Identify and alert on scope changes threatening delivery timelines via story point drift and sprint boundary violations",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["delivery", "scope", "risk", "alerts"],
    examples: [
      "Are there any active scope creep alerts?",
      "Which engagements have exceeded their estimated story points?",
    ],
  },
  {
    id: "delivery-intelligence",
    name: "Delivery Health Assessment",
    description: "Full engagement health snapshot across all active delivery pods — combines engagement health, engineer signals, scope alerts, and pod recommendations",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["delivery", "health", "engagement", "assessment"],
    examples: [
      "What is the overall delivery health of my portfolio?",
      "Give me a health snapshot for the Tookitaki engagement",
    ],
  },

  // ── SE-aaS: Code Intelligence (Sprint 1-3, original 8) ────────────────────
  {
    id: "test-data-generator",
    name: "Test Data Generator",
    description: "Generate realistic, schema-aware test data sets for any database schema or API contract",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["json"],
    tags: ["testing", "data", "quality", "engineering"],
  },
  {
    id: "sql-analyzer",
    name: "SQL Analyzer",
    description: "Analyze SQL queries for performance issues, N+1 patterns, missing indexes, and query plan optimization",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["sql", "database", "performance", "engineering"],
  },
  {
    id: "test-case-generator",
    name: "Test Case Generator",
    description: "Generate comprehensive unit and integration test cases with edge cases from code or spec input",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["testing", "quality", "engineering"],
  },
  {
    id: "tdd-code-generator",
    name: "TDD Code Generator",
    description: "Generate production code from failing tests following Test-Driven Development principles",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["tdd", "testing", "code", "engineering"],
  },
  {
    id: "incident-diagnosis",
    name: "Incident Diagnosis",
    description: "Diagnose production incidents using logs, traces, and error patterns to identify root cause and recommend remediation",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["incident", "diagnosis", "reliability", "engineering"],
  },
  {
    id: "impact-analysis",
    name: "Impact Analysis",
    description: "Analyze the blast radius of a code change across the dependency graph — downstream effects, risk score, affected services",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["impact", "risk", "dependencies", "engineering"],
  },
  {
    id: "data-lineage",
    name: "Data Lineage",
    description: "Trace data lineage across pipelines — where data comes from, how it transforms, and where it flows",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["data", "lineage", "tracing", "engineering"],
  },
  {
    id: "log-query",
    name: "Log Query",
    description: "Query and analyze structured logs to surface error clusters, anomaly patterns, and operational insights",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["logs", "observability", "engineering"],
  },

  // ── SE-aaS: P1 Gap Closure (4 from CTO spec) ─────────────────────────────
  {
    id: "dependency-upgrade",
    name: "Dependency Upgrade",
    description: "Analyze and plan dependency upgrades — breaking changes, migration paths, compatibility matrix, and rollout risk",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["dependencies", "upgrades", "engineering"],
  },
  {
    id: "design-doc-generator",
    name: "Design Doc Generator",
    description: "Generate technical design documents from feature specs — architecture decisions, trade-offs, API contracts, and data models",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["design", "documentation", "architecture", "engineering"],
  },
  {
    id: "performance-profiler",
    name: "Performance Profiler",
    description: "Profile application performance — CPU hotspots, memory leaks, latency distributions, and optimization recommendations",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["performance", "profiling", "optimization", "engineering"],
  },
  {
    id: "dead-code-detector",
    name: "Dead Code Detector",
    description: "Identify unreachable code, unused exports, and deprecated patterns that can be safely removed",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["code-quality", "cleanup", "engineering"],
  },

  // ── SE-aaS: SWE Gap Closure (3 remaining capabilities) ────────────────────
  {
    id: "pr-review",
    name: "PR Review",
    description: "Automated pull request review — code quality, security vulnerabilities, style violations, and logic errors",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["pr", "review", "quality", "engineering"],
  },
  {
    id: "boilerplate-scaffold",
    name: "Boilerplate Scaffold",
    description: "Generate production-ready boilerplate for new services, components, or modules following org-specific conventions",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["scaffold", "boilerplate", "engineering"],
  },
  {
    id: "codebase-qa",
    name: "Codebase Q&A",
    description: "Answer natural-language questions about the codebase — architecture, patterns, where logic lives, how systems connect",
    serviceArea: "se-aas",
    inputModes: ["text"],
    outputModes: ["text"],
    tags: ["codebase", "qa", "documentation", "engineering"],
  },

  // ── SE-aaS: P1-15 Architecture & Spec Decomposition ──────────────────────
  {
    id: "architecture-extractor",
    name: "Architecture Extractor",
    description: "Extract and visualize system architecture from code — service boundaries, dependencies, data flows, and integration points",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["architecture", "visualization", "engineering"],
  },
  {
    id: "decompose-spec",
    name: "Spec Decomposition",
    description: "Decompose a feature specification into actionable engineering tickets with estimates, dependencies, and domain classification",
    serviceArea: "se-aas",
    inputModes: ["text", "json"],
    outputModes: ["json"],
    tags: ["spec", "tickets", "planning", "engineering"],
  },

  // ── AaaS: Accounting as a Service ─────────────────────────────────────────
  {
    id: "aas-bookkeep",
    name: "AI Bookkeeping",
    description: "Categorize and book GL transactions using double-entry accounting principles with brain-augmented pattern matching",
    serviceArea: "aas",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["accounting", "bookkeeping", "finance", "gl"],
  },
  {
    id: "aas-reconcile",
    name: "Account Reconciliation",
    description: "Reconcile bank statements against GL entries — detect discrepancies, missing entries, and unmatched transactions",
    serviceArea: "aas",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["accounting", "reconciliation", "finance", "bank"],
  },
  {
    id: "aas-statements",
    name: "Financial Statement Generation",
    description: "Generate P&L, balance sheet, and cash flow statements from GL data with revenue recognition rules applied",
    serviceArea: "aas",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["accounting", "statements", "finance", "reporting"],
  },
  {
    id: "aas-tax",
    name: "Tax Compliance",
    description: "Identify tax obligations, compute GST/VAT, and flag jurisdiction-specific compliance requirements across territories",
    serviceArea: "aas",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["accounting", "tax", "compliance", "finance"],
  },
  {
    id: "aas-audit",
    name: "Audit Preparation",
    description: "Prepare audit-ready financial packages — reconciled trial balance, supporting schedules, and evidence packages",
    serviceArea: "aas",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["accounting", "audit", "compliance", "finance"],
  },
  {
    id: "aas-anomaly",
    name: "Financial Anomaly Detection",
    description: "Detect anomalous transactions — duplicate payments, unusual amounts, timing irregularities, and fraud signals",
    serviceArea: "aas",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["accounting", "anomaly", "fraud", "finance"],
  },
  {
    id: "aas-causal-analysis",
    name: "Causal Financial Analysis",
    description: "Causal root-cause analysis of financial outcomes — why revenue changed, what drove expense variance, causal chain explanation",
    serviceArea: "aas",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["accounting", "causal", "analysis", "finance"],
  },
  {
    id: "aas-cash-forecast",
    name: "Cash Flow Forecast",
    description: "AI-powered cash flow forecasting — 90-day runway projection, burn rate analysis, and scenario modeling",
    serviceArea: "aas",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["accounting", "forecast", "cash-flow", "finance"],
  },
  {
    id: "aas-revenue-leakage",
    name: "Revenue Leakage Detection",
    description: "Identify unbilled work, missed invoices, contract overruns, and revenue recognition gaps that erode recognized revenue",
    serviceArea: "aas",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["accounting", "revenue", "leakage", "finance"],
  },
  {
    id: "aas-causal-pl",
    name: "Causal P&L Narrative",
    description: "Generate a plain-English causal narrative explaining P&L movements — what drove each line item change and why",
    serviceArea: "aas",
    inputModes: ["json"],
    outputModes: ["text", "json"],
    tags: ["accounting", "pl", "narrative", "finance"],
  },

  // ── PM-aaS: Product Management as a Service ───────────────────────────────
  {
    id: "pm-roadmap-planner",
    name: "Roadmap Planner",
    description: "Generate a structured product roadmap from goals and constraints — themes, milestones, quarterly priorities, and OKR alignment",
    serviceArea: "pm-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["product", "roadmap", "planning", "strategy"],
  },
  {
    id: "pm-sprint-health",
    name: "Sprint Health",
    description: "Assess current sprint status — velocity, blockers, scope changes, completion forecast, and risk to delivery",
    serviceArea: "pm-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["product", "sprint", "health", "velocity"],
  },
  {
    id: "pm-backlog-prioritizer",
    name: "Backlog Prioritizer",
    description: "Score and rank backlog items by business value, effort, risk, and strategic alignment using RICE or custom models",
    serviceArea: "pm-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["product", "backlog", "prioritization", "planning"],
  },
  {
    id: "pm-stakeholder-alignment",
    name: "Stakeholder Alignment",
    description: "Generate stakeholder-tailored update communications — executive summaries, engineering status, customer-facing updates",
    serviceArea: "pm-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["product", "stakeholder", "communication", "alignment"],
  },
  {
    id: "pm-release-risk",
    name: "Release Risk Assessment",
    description: "Evaluate release readiness — open blockers, test coverage gaps, infrastructure dependencies, and go/no-go recommendation",
    serviceArea: "pm-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["product", "release", "risk", "readiness"],
  },
  {
    id: "pm-feature-impact",
    name: "Feature Impact Analysis",
    description: "Analyze a feature's effort, risk, dependency graph, and expected customer impact before committing to the roadmap",
    serviceArea: "pm-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["product", "feature", "impact", "analysis"],
  },
  {
    id: "pm-capacity-planner",
    name: "Capacity Planner",
    description: "Model team capacity against planned work — headcount gaps, sprint overload risks, and rebalancing recommendations",
    serviceArea: "pm-aas",
    inputModes: ["text", "json"],
    outputModes: ["text", "json"],
    tags: ["product", "capacity", "planning", "team"],
  },

  // ── Process Engine: Business Process Automation ───────────────────────────
  {
    id: "hr-offboarding",
    name: "HR Offboarding",
    description: "Automated HR offboarding workflow — PTO settlement, severance calculation, equity review, and manager/HR/legal approval gates",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["hr", "process", "offboarding", "workflow"],
  },
  {
    id: "procurement",
    name: "Procurement Approval",
    description: "Purchase order processing with multi-tier approval routing — budget policy checks, new vendor vetting, committee escalation",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["procurement", "process", "approval", "workflow"],
  },
  {
    id: "order-management",
    name: "Order Management",
    description: "Customer order modification processing — refund/charge recalculation, gift card policy, substitute item approval, fulfillment routing",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["orders", "process", "fulfillment", "workflow"],
  },
  {
    id: "expense-approval",
    name: "Expense Approval",
    description: "Employee expense claim processing — receipt validation, policy enforcement, manager approval, and out-of-policy escalation",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["expense", "process", "approval", "workflow"],
  },
  {
    id: "customer-onboarding",
    name: "Customer Onboarding",
    description: "New customer onboarding workflow — KYC verification, high-risk country escalation, account provisioning, and welcome communications",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["onboarding", "kyc", "process", "workflow"],
  },
  {
    id: "insurance-claim",
    name: "Insurance Claim Processing",
    description: "End-to-end insurance claim evaluation — coverage sublimit application, fraud detection, partial approval, and rider processing",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["insurance", "claims", "process", "workflow"],
  },
  {
    id: "invoice-reconciliation",
    name: "Invoice Reconciliation",
    description: "Multi-vendor invoice matching against POs — duplicate detection, price variance checks, FX rate validation, and early payment discounts",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["invoice", "reconciliation", "finance", "workflow"],
  },
  {
    id: "sla-breach-escalation",
    name: "SLA Breach Escalation",
    description: "SLA compliance monitoring — breach calculation, service credit computation, quiet-hours notification scheduling, cascading escalation",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["sla", "escalation", "compliance", "workflow"],
  },
  {
    id: "travel-rebooking",
    name: "Travel Rebooking",
    description: "Complex travel itinerary modification — fare class rules, loyalty tier benefits, company policy enforcement, downstream cancellation",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["travel", "rebooking", "process", "workflow"],
  },
  {
    id: "compliance-audit",
    name: "Regulatory Compliance Audit",
    description: "KYC/AML compliance verification — document gap detection, PEP screening, remediation deadline assignment, RM escalation",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["compliance", "kyc", "aml", "workflow"],
  },
  {
    id: "subscription-migration",
    name: "Subscription Migration",
    description: "Plan downgrade/upgrade processing — prorated refund calculation, feature conflict detection, compliance warnings, early termination fees",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["subscription", "migration", "billing", "workflow"],
  },
  {
    id: "dispute-resolution",
    name: "Dispute Resolution",
    description: "E-commerce dispute handling — evidence review, buyer frequency checks, mandatory escalation for elevated-risk buyers, transaction hold",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["dispute", "resolution", "ecommerce", "workflow"],
  },
  {
    id: "financial-close",
    name: "Month-End Financial Close",
    description: "Month-end close process — bank reconciliation, P&L generation with revenue recognition, cash flow statement, suspense account audit trail",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["finance", "close", "accounting", "workflow"],
  },
  {
    id: "product-workflow",
    name: "Product Story to Engineering Workflow",
    description: "PM brief to Confluence PRD to Jira epic decomposition — sprint allocation with capacity and dependency checks, stakeholder notifications",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["product", "engineering", "jira", "workflow"],
  },
  {
    id: "ar-collections",
    name: "Accounts Receivable Collections",
    description: "AR aging analysis with 6-path collection routing — enterprise exemption, credit notes, payment plans, bankruptcy write-off, government terms",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["ar", "collections", "finance", "workflow"],
  },
  {
    id: "incident-response",
    name: "IT Incident Response",
    description: "Production incident triage — root cause analysis, PCI-compliant remediation, 2-person approval for credential changes, blameless post-mortem",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["incident", "response", "sre", "workflow"],
  },
  {
    id: "qbr-preparation",
    name: "QBR Preparation",
    description: "Quarterly Business Review data aggregation — multi-source reconciliation, insight generation, stakeholder-specific deck variants, sequenced distribution",
    serviceArea: "process-engine",
    inputModes: ["json"],
    outputModes: ["json"],
    tags: ["qbr", "reporting", "finance", "workflow"],
  },
];

/**
 * Get all skills for a specific service area.
 */
export function getSkillsByServiceArea(serviceArea: AgentSkill["serviceArea"]): AgentSkill[] {
  return AGENT_SKILLS.filter((s) => s.serviceArea === serviceArea);
}

/**
 * Look up a skill by its ID.
 */
export function getSkillById(id: string): AgentSkill | undefined {
  return AGENT_SKILLS.find((s) => s.id === id);
}

/**
 * Return all skill IDs. Useful for validation.
 */
export function getAllSkillIds(): string[] {
  return AGENT_SKILLS.map((s) => s.id);
}

/**
 * Return skill count broken down by service area. Useful for health endpoints and logging.
 */
export function getSkillCountByServiceArea(): Record<AgentSkill["serviceArea"], number> {
  const counts: Record<AgentSkill["serviceArea"], number> = {
    "se-aas": 0,
    "aas": 0,
    "pm-aas": 0,
    "process-engine": 0,
    "brain": 0,
  };
  for (const skill of AGENT_SKILLS) {
    counts[skill.serviceArea]++;
  }
  return counts;
}
