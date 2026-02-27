/**
 * Action Domain Registry — SINGLE SOURCE OF TRUTH for all domain metadata.
 *
 * Every domain across SE-aaS, PM-aaS, and AaaS is defined here.
 * domain-router.ts, llm-query-interpreter.ts, and chat/route.ts all derive
 * their Sets and Maps from this registry — never maintain their own copies.
 *
 * To add a new domain: add one entry here. That's it.
 */

export type DomainCategory = "se-aas" | "pm-aas" | "aas";
export type DomainExecutionMode = "sync" | "async";

export type DomainRegistryEntry = {
  id: string; // the domain string used in routing
  category: DomainCategory;
  displayName: string;
  keywords: string[]; // trigger keywords for LLM routing
  regexPatterns: string[]; // regex patterns for fallback matching (informational)
  executionMode: DomainExecutionMode;
  implemented: boolean; // false = stub, true = has executor
  aliases?: string[]; // alternate names (e.g., 'tdd' for 'tdd-code-generator')
  moaEnabled?: boolean; // Method of Agreement synthesis enabled
};

export const DOMAIN_REGISTRY: DomainRegistryEntry[] = [
  // ─── SE-aaS domains ────────────────────────────────────────────────────────
  {
    id: "test-data-generator",
    category: "se-aas",
    displayName: "Test Data Generator",
    keywords: ["test data", "generate data", "seed data", "mock data", "fake data", "synthetic data"],
    regexPatterns: ["test.?data", "generat.*data", "mock.data", "seed.data"],
    executionMode: "sync",
    implemented: true,
  },
  {
    id: "sql-analyzer",
    category: "se-aas",
    displayName: "SQL Analyzer",
    keywords: ["sql", "query", "analyze query", "sql quality", "sql audit", "optimize sql"],
    regexPatterns: ["sql", "analyz.*quer", "optimize.*sql"],
    executionMode: "sync",
    implemented: true,
  },
  {
    id: "test-case-generator",
    category: "se-aas",
    displayName: "Test Case Generator",
    keywords: ["test case", "unit test", "write tests", "generate test cases", "test suite"],
    regexPatterns: ["test.?case", "unit.?test", "test.suite"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "tdd-code-generator",
    category: "se-aas",
    displayName: "TDD Code Generator",
    keywords: ["tdd", "test driven", "write code", "red green refactor", "implement with tests"],
    regexPatterns: ["tdd", "test.driven", "red.green"],
    executionMode: "async",
    implemented: true,
    aliases: ["tdd"],
  },
  {
    id: "incident-diagnosis",
    category: "se-aas",
    displayName: "Incident Diagnosis",
    keywords: ["incident", "outage", "diagnose", "root cause", "why is down"],
    regexPatterns: ["incident", "diagnos", "outage", "root.cause"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "impact-analysis",
    category: "se-aas",
    displayName: "Impact Analysis",
    keywords: ["impact", "change impact", "blast radius", "downstream impact", "what's affected"],
    regexPatterns: ["impact.anal", "blast.radius", "downstream.impact"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "data-lineage",
    category: "se-aas",
    displayName: "Data Lineage",
    keywords: ["data lineage", "lineage", "data flow", "trace data", "data origin"],
    regexPatterns: ["data.lineage", "lineage", "data.flow"],
    executionMode: "sync",
    implemented: true,
  },
  {
    id: "log-query",
    category: "se-aas",
    displayName: "Log Query",
    keywords: ["log", "logs", "query logs", "search logs", "log analysis", "log investigation"],
    regexPatterns: ["log.?quer", "search.?log", "log.analys"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "dependency-upgrade",
    category: "se-aas",
    displayName: "Dependency Upgrade",
    keywords: ["dependency", "upgrade", "npm update", "npm audit", "security vulnerability", "outdated dep"],
    regexPatterns: ["depend.*upgrad", "upgrad.*depend", "npm.audit", "cve.audit"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "design-doc-generator",
    category: "se-aas",
    displayName: "Design Doc Generator",
    keywords: ["design doc", "technical spec", "architecture doc", "hld", "lld", "c4 diagram"],
    regexPatterns: ["design.doc", "tech.spec", "hld", "lld", "c4.diagram"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "performance-profiler",
    category: "se-aas",
    displayName: "Performance Profiler",
    keywords: ["performance", "profil", "slow", "bottleneck", "latency", "memory leak", "core web vitals"],
    regexPatterns: ["perf.*profil", "slow.*code", "bottleneck", "memory.leak"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "dead-code-detector",
    category: "se-aas",
    displayName: "Dead Code Detector",
    keywords: ["dead code", "unused code", "remove unused", "unreachable code", "code cleanup"],
    regexPatterns: ["dead.code", "unused.code", "unreachable"],
    executionMode: "sync",
    implemented: true,
  },
  {
    id: "pr-review",
    category: "se-aas",
    displayName: "PR Review",
    keywords: ["pull request", "pr review", "code review", "review pr", "review diff"],
    regexPatterns: ["pr.review", "pull.request", "code.review"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "boilerplate-scaffold",
    category: "se-aas",
    displayName: "Boilerplate Scaffold",
    keywords: ["scaffold", "boilerplate", "generate project", "generate crud", "generate endpoint"],
    regexPatterns: ["scaffold", "boilerplate"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "codebase-qa",
    category: "se-aas",
    displayName: "Codebase Q&A",
    keywords: ["explain code", "how does", "what is this", "understand code", "codebase"],
    regexPatterns: ["explain.code", "codebase.qa"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "pod-match",
    category: "se-aas",
    displayName: "Pod Match",
    keywords: ["pod", "match pod", "team match", "assign pod", "recommend pod", "which pod"],
    regexPatterns: ["pod.match", "match.*pod", "recommend.*pod"],
    executionMode: "sync",
    implemented: true,
  },
  {
    id: "delivery-intelligence",
    category: "se-aas",
    displayName: "Delivery Intelligence",
    keywords: ["delivery", "engagement health", "delivery health", "health score", "rag status", "forecast confidence"],
    regexPatterns: ["delivery.intel", "engagement.health", "health.score"],
    executionMode: "sync",
    implemented: true,
    moaEnabled: true,
  },
  {
    id: "early-warning",
    category: "se-aas",
    displayName: "Early Warning",
    keywords: [
      "early warning",
      "flight risk",
      "at risk engineer",
      "velocity collapse",
      "overallocation",
      "review burden",
      "sprint velocity",
    ],
    regexPatterns: ["early.warn", "flight.risk", "velocity.collapse", "overalloc"],
    executionMode: "sync",
    implemented: true,
    moaEnabled: true,
  },
  {
    id: "scope-creep",
    category: "se-aas",
    displayName: "Scope Creep",
    keywords: ["scope creep", "scope drift", "out of scope", "scope integrity", "unplanned work"],
    regexPatterns: ["scope.creep", "scope.drift", "scope.integrit"],
    executionMode: "sync",
    implemented: true,
  },
  {
    id: "architecture-extractor",
    category: "se-aas",
    displayName: "Architecture Extractor",
    keywords: ["architecture", "system design", "extract architecture", "service graph", "c4", "service map"],
    regexPatterns: ["architect.*extract", "system.design", "service.graph", "c4.diagram"],
    executionMode: "async",
    implemented: true,
  },
  // ─── PM-aaS domains (stubs — implemented: false) ──────────────────────────
  {
    id: "roadmap-planner",
    category: "pm-aas",
    displayName: "Roadmap Planner",
    keywords: ["roadmap", "product roadmap", "quarterly roadmap", "strategic roadmap"],
    regexPatterns: ["roadmap"],
    executionMode: "async",
    implemented: false,
  },
  {
    id: "sprint-health",
    category: "pm-aas",
    displayName: "Sprint Health",
    keywords: ["sprint", "sprint health", "sprint status", "sprint burn", "current sprint"],
    regexPatterns: ["sprint.health", "sprint.status"],
    executionMode: "async",
    implemented: false,
  },
  {
    id: "backlog-prioritizer",
    category: "pm-aas",
    displayName: "Backlog Prioritizer",
    keywords: ["backlog", "prioritize", "wsjf", "ice score", "rice score", "story points"],
    regexPatterns: ["backlog", "prioriti.*backlog"],
    executionMode: "async",
    implemented: false,
  },
  {
    id: "stakeholder-alignment",
    category: "pm-aas",
    displayName: "Stakeholder Alignment",
    keywords: ["stakeholder", "alignment", "executive update", "pm update", "status update"],
    regexPatterns: ["stakeholder", "executive.update"],
    executionMode: "async",
    implemented: false,
  },
  {
    id: "release-risk",
    category: "pm-aas",
    displayName: "Release Risk",
    keywords: ["release risk", "release readiness", "go no-go", "launch risk", "can we release"],
    regexPatterns: ["release.risk", "go.no.go", "launch.risk"],
    executionMode: "async",
    implemented: false,
  },
  {
    id: "feature-impact",
    category: "pm-aas",
    displayName: "Feature Impact",
    keywords: ["feature impact", "feature estimate", "effort estimate", "should we build", "mvp scope"],
    regexPatterns: ["feature.impact", "feature.estimate"],
    executionMode: "async",
    implemented: false,
  },
  {
    id: "capacity-planner",
    category: "pm-aas",
    displayName: "Capacity Planner",
    keywords: ["capacity", "capacity planning", "team capacity", "sprint capacity", "bandwidth"],
    regexPatterns: ["capacity.plan", "team.capacity"],
    executionMode: "async",
    implemented: false,
  },
  // ─── AaaS domains ─────────────────────────────────────────────────────────
  {
    id: "statement-generator",
    category: "aas",
    displayName: "Statement Generator",
    keywords: ["p&l", "income statement", "balance sheet", "cash flow statement", "profit and loss", "revenue breakdown"],
    regexPatterns: ["p.?l", "income.statement", "balance.sheet", "cash.flow"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "reconciler",
    category: "aas",
    displayName: "Reconciler",
    keywords: ["reconcile", "trial balance", "month-end", "completeness check"],
    regexPatterns: ["reconcil", "trial.balance", "month.end"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "bookkeeper",
    category: "aas",
    displayName: "Bookkeeper",
    keywords: ["bookkeep", "journal entry", "chart of accounts", "double entry", "classify account"],
    regexPatterns: ["bookkeep", "journal.entry", "chart.of.account"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "tax-compliance",
    category: "aas",
    displayName: "Tax Compliance",
    keywords: ["tax", "gst", "withholding tax", "iras", "vat", "tax filing"],
    regexPatterns: ["gst", "tax.compli", "withhold", "iras"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "anomaly-detective",
    category: "aas",
    displayName: "Anomaly Detective",
    keywords: ["anomaly", "fraud", "duplicate transaction", "benford", "suspicious transaction"],
    regexPatterns: ["anomaly", "benford", "duplicate.trans", "fraud"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "audit-preparer",
    category: "aas",
    displayName: "Audit Preparer",
    keywords: ["audit", "workpaper", "audit risk", "audit readiness", "external audit"],
    regexPatterns: ["audit.prep", "workpaper", "audit.risk"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "cash-flow-prophet",
    category: "aas",
    displayName: "Cash Flow Prophet",
    keywords: ["cash flow", "runway", "burn rate", "cash balance", "cash position"],
    regexPatterns: ["cash.balance", "burn.rate", "runway", "cash.flow"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "revenue-leakage-detector",
    category: "aas",
    displayName: "Revenue Leakage Detector",
    keywords: ["revenue leakage", "missed revenue"],
    regexPatterns: ["revenue.leak"],
    executionMode: "async",
    implemented: true,
  },
  {
    id: "causal-pl-narrator",
    category: "aas",
    displayName: "Causal P&L Narrator",
    keywords: ["causal pl", "p&l narrative", "explain revenue"],
    regexPatterns: ["causal.pl", "p.?l.narrat"],
    executionMode: "async",
    implemented: true,
  },
];

// ─── Derived convenience exports ──────────────────────────────────────────────
// These replace the scattered Sets/Maps previously maintained in domain-router.ts
// and elsewhere. Import from here — never maintain a local copy.

/** All valid SE-aaS domain IDs (including aliases). THE gate for LLM routing. */
export const VALID_SEAAS_DOMAIN_IDS = new Set(
  DOMAIN_REGISTRY.filter((d) => d.category === "se-aas" && d.implemented).flatMap(
    (d) => [d.id, ...(d.aliases ?? [])]
  )
);

/** All valid PM-aaS domain IDs. */
export const VALID_PM_AAS_DOMAIN_IDS = new Set(
  DOMAIN_REGISTRY.filter((d) => d.category === "pm-aas").map((d) => d.id)
);

/** All implemented domain IDs across all categories (including aliases). */
export const ALL_IMPLEMENTED_DOMAINS = new Set(
  DOMAIN_REGISTRY.filter((d) => d.implemented).flatMap((d) => [d.id, ...(d.aliases ?? [])])
);

/**
 * Look up a registry entry by domain ID or alias.
 * Returns undefined if the domain is not registered.
 */
export function getDomainEntry(domainId: string): DomainRegistryEntry | undefined {
  return DOMAIN_REGISTRY.find(
    (d) => d.id === domainId || d.aliases?.includes(domainId)
  );
}
