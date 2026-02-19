/**
 * Shared Domain Catalogue — SE-AAS & AAAS
 * ========================================
 *
 * Single source of truth for all 17 SE-aaS domain definitions
 * and 6 AAAS agent definitions. Consumed by:
 *   - se-aas/page.tsx (service marketplace)
 *   - se-aas/artifacts/page.tsx (artifact list domain labels)
 *   - PartnerDashboard (usage heatmap)
 *   - ActivationChecklist (domain references)
 *
 * Do NOT duplicate domain labels/icons elsewhere — import from here.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type DomainEntry = {
  id: string;
  label: string;
  icon: string;
  category: string;
  description: string;
  badge?: string;
  badgeVariant?: "accent" | "danger" | "warning" | "success";
  badgePulse?: boolean;
  href?: string;
  copilotPrompt?: string;
  colorClass: string;   // Tailwind text color for accent
  ringClass: string;    // border color
  bgClass: string;      // subtle background tint
};

export type DomainLabel = {
  label: string;
  icon: string;
  color: string;
};

// ── SE-AAS Domain Catalogue (17 domains) ───────────────────────────────────

export const DOMAIN_CATALOGUE: DomainEntry[] = [
  // ── P0: Delivery Intelligence ──────────────────────────────────────────
  {
    id: "early-warning",
    label: "Early Warning",
    icon: "⚡",
    category: "P0 · Delivery Intelligence",
    description:
      "Velocity collapse prediction with GBRT ML · SPOF bottleneck risk via Gini, HHI & Betweenness Centrality. Real-time branch-scoped monitoring.",
    badge: "Live",
    badgeVariant: "accent",
    badgePulse: true,
    href: "/early-warning",
    colorClass: "text-red-400",
    ringClass: "border-red-500/25",
    bgClass: "bg-red-500/5",
  },

  // ── P1: Code Intelligence ──────────────────────────────────────────────
  {
    id: "pr-review",
    label: "PR Review",
    icon: "🔍",
    category: "P1 · Code Intelligence",
    description:
      "Brain-augmented code review with causal cascade impact — see how this PR ripples through NPS, customer success, and revenue via L4 causal graph edges.",
    href: "/se-aas/pr-review",
    copilotPrompt: "Review my latest PR diff and show me the causal business impact",
    colorClass: "text-blue-400",
    ringClass: "border-blue-500/25",
    bgClass: "bg-blue-500/5",
  },
  {
    id: "tdd",
    label: "TDD Agent",
    icon: "🧪",
    category: "P1 · Code Intelligence",
    description:
      "Red-Green-Refactor cycle: auto-generate unit + integration tests with coverage estimation, mocking strategy, and test prioritisation from Brain signal history.",
    copilotPrompt: "Generate TDD tests for my code using the Red-Green-Refactor cycle",
    colorClass: "text-green-400",
    ringClass: "border-green-500/25",
    bgClass: "bg-green-500/5",
  },
  {
    id: "boilerplate-scaffold",
    label: "Scaffolding",
    icon: "🏗️",
    category: "P1 · Code Intelligence",
    description:
      "Generate production-ready boilerplate: REST API, microservice, React component, CLI tool — opinionated templates with your team's patterns baked in.",
    href: "/se-aas/scaffolding",
    copilotPrompt: "Generate a production-ready TypeScript REST API scaffold",
    colorClass: "text-purple-400",
    ringClass: "border-purple-500/25",
    bgClass: "bg-purple-500/5",
  },
  {
    id: "dependency-upgrade",
    label: "Dep Upgrade",
    icon: "📦",
    category: "P1 · Code Intelligence",
    description:
      "Audit outdated packages, detect breaking changes, generate migration steps with risk scores, flag CVEs, and surface npm advisory security issues.",
    href: "/se-aas/dep-upgrade",
    copilotPrompt: "Audit my package.json for outdated dependencies and security issues",
    colorClass: "text-orange-400",
    ringClass: "border-orange-500/25",
    bgClass: "bg-orange-500/5",
  },
  {
    id: "design-doc-generator",
    label: "HLD / LLD",
    icon: "📐",
    category: "P1 · Code Intelligence",
    description:
      "Forward mode (requirements → design) or reverse mode (code → design): generates HLD & LLD docs with Mermaid architecture, sequence, and ER diagrams.",
    href: "/se-aas/design-doc",
    copilotPrompt: "Generate an HLD and LLD for my system with Mermaid architecture diagrams",
    colorClass: "text-cyan-400",
    ringClass: "border-cyan-500/25",
    bgClass: "bg-cyan-500/5",
  },

  // ── P1: Test Intelligence ──────────────────────────────────────────────
  {
    id: "test-case-generator",
    label: "Test Cases",
    icon: "✅",
    category: "P1 · Test Intelligence",
    description:
      "Generate comprehensive test suites from code analysis — edge cases, boundary conditions, happy paths, integration paths, and negative test scenarios.",
    href: "/se-aas/test-cases",
    copilotPrompt: "Generate a comprehensive test suite for my codebase covering all edge cases",
    colorClass: "text-emerald-400",
    ringClass: "border-emerald-500/25",
    bgClass: "bg-emerald-500/5",
  },
  {
    id: "test-data-generator",
    label: "Test Data",
    icon: "🎲",
    category: "P1 · Test Intelligence",
    description:
      "Synthetic test data generation with referential integrity, PII-safe anonymisation, and scenario-based dataset creation for realistic load testing.",
    href: "/se-aas/test-data",
    copilotPrompt: "Generate realistic synthetic test data for my database schema",
    colorClass: "text-teal-400",
    ringClass: "border-teal-500/25",
    bgClass: "bg-teal-500/5",
  },

  // ── SWE Gap Closure ────────────────────────────────────────────────────
  {
    id: "codebase-qa",
    label: "Codebase Q&A",
    icon: "💬",
    category: "SWE · Codebase Understanding",
    description:
      "Ask natural language questions about your codebase — Brain-augmented with learned team patterns, architectural decisions, and cross-module dependency knowledge.",
    href: "/se-aas/codebase-qa",
    copilotPrompt: "Explain how the authentication system works in our codebase",
    colorClass: "text-violet-400",
    ringClass: "border-violet-500/25",
    bgClass: "bg-violet-500/5",
  },
  {
    id: "dead-code-detector",
    label: "Dead Code",
    icon: "🧹",
    category: "SWE · Codebase Understanding",
    description:
      "Identify unreachable functions, unused imports, dead files — safe removal plan with confidence scores ranked by impact on bundle size and maintenance burden.",
    href: "/se-aas/dead-code",
    copilotPrompt: "Find all dead code, unused imports, and unreachable functions in my codebase",
    colorClass: "text-gray-400",
    ringClass: "border-gray-500/25",
    bgClass: "bg-gray-500/5",
  },
  {
    id: "impact-analysis",
    label: "Impact Analysis",
    icon: "💥",
    category: "SWE · Codebase Understanding",
    description:
      "Blast radius analysis: what breaks if you change module X? Traces dependency graph paths, identifies fragile coupling, and ranks downstream risk.",
    href: "/se-aas/impact",
    copilotPrompt: "What's the blast radius if I refactor the auth module?",
    colorClass: "text-red-400",
    ringClass: "border-red-500/25",
    bgClass: "bg-red-500/5",
  },

  // ── Observability ──────────────────────────────────────────────────────
  {
    id: "incident-diagnosis",
    label: "Incident RCA",
    icon: "🚨",
    category: "Observability",
    description:
      "Root cause analysis with Brain causal intelligence — trace production incidents upstream through signal history to the engineering or config change that triggered them.",
    badge: "High Priority Gap",
    badgeVariant: "warning",
    href: "/se-aas/incident",
    copilotPrompt: "Diagnose our production incident and trace the root cause using Brain causal intelligence",
    colorClass: "text-pink-400",
    ringClass: "border-pink-500/25",
    bgClass: "bg-pink-500/5",
  },
  {
    id: "log-query",
    label: "Log Query",
    icon: "📋",
    category: "Observability",
    description:
      "Query logs with natural language — pattern detection, error clustering, anomaly timeline construction, and structured export for post-mortems.",
    badge: "High Priority Gap",
    badgeVariant: "warning",
    href: "/se-aas/log-query",
    copilotPrompt: "Find all ERROR patterns in the last 24h logs and cluster them by root cause",
    colorClass: "text-yellow-400",
    ringClass: "border-yellow-500/25",
    bgClass: "bg-yellow-500/5",
  },
  {
    id: "performance-profiler",
    label: "Perf Profiler",
    icon: "⚡",
    category: "Observability",
    description:
      "APM analysis: identify slow endpoints, N+1 queries, memory leaks, and SLA risk — ranked by business impact from Brain's revenue-performance causal model.",
    href: "/se-aas/perf-profiler",
    copilotPrompt: "Analyze our APM data and identify the top 3 performance bottlenecks",
    colorClass: "text-amber-400",
    ringClass: "border-amber-500/25",
    bgClass: "bg-amber-500/5",
  },

  // ── Data ──────────────────────────────────────────────────────────────
  {
    id: "sql-analyzer",
    label: "SQL Analyzer",
    icon: "🗄️",
    category: "Data",
    description:
      "SQL correctness, performance optimisation, N+1 detection, injection prevention, and style linting — with execution plan analysis where DB access is available.",
    href: "/se-aas/sql-analyze",
    copilotPrompt: "Analyze this SQL query for performance issues, N+1 patterns, and security risks",
    colorClass: "text-blue-400",
    ringClass: "border-blue-500/25",
    bgClass: "bg-blue-500/5",
  },
  {
    id: "data-lineage",
    label: "Data Lineage",
    icon: "🔗",
    category: "Data",
    description:
      "Map data flow through your system — FK relationships, transformation chains, circular dependency detection, and compliance-ready lineage reports.",
    badge: "High Priority Gap",
    badgeVariant: "warning",
    href: "/se-aas/lineage",
    copilotPrompt: "Map the data lineage for our user transaction table",
    colorClass: "text-indigo-400",
    ringClass: "border-indigo-500/25",
    bgClass: "bg-indigo-500/5",
  },

  // ── SWE · Architecture ────────────────────────────────────────────────
  {
    id: "architecture-extractor",
    label: "Architecture",
    icon: "🏛️",
    category: "SWE · Codebase Understanding",
    description:
      "Extract your full system architecture: service graph, data flows, module ownership, Mermaid diagrams, and architecture risks — auto-updated as code changes.",
    href: "/se-aas/architecture",
    copilotPrompt: "Extract the full architecture of my system with service graphs and Mermaid diagrams",
    badge: "New",
    badgeVariant: "accent",
    colorClass: "text-sky-400",
    ringClass: "border-sky-500/25",
    bgClass: "bg-sky-500/5",
  },
];

// ── Derived lookups ────────────────────────────────────────────────────────────

/** id → { label, icon, colorClass, bgClass } for quick lookups */
export const DOMAIN_LABEL_MAP: Record<
  string,
  { label: string; icon: string; colorClass: string; bgClass: string }
> = Object.fromEntries(
  DOMAIN_CATALOGUE.map((d) => [
    d.id,
    { label: d.label, icon: d.icon, colorClass: d.colorClass, bgClass: d.bgClass },
  ])
);

/** id → { label, icon, color } for artifact list domain chips */
export const DOMAIN_LABELS: Record<string, DomainLabel> = Object.fromEntries(
  DOMAIN_CATALOGUE.map((d) => [
    d.id,
    { label: d.label, icon: d.icon, color: d.colorClass },
  ])
);

// ── AAAS Agent Catalogue (6 agents) ────────────────────────────────────────────

export type AaasAgentEntry = {
  id: string;
  label: string;
  icon: string;
  description: string;
  colorClass: string;
};

export const AAAS_AGENT_CATALOGUE: AaasAgentEntry[] = [
  {
    id: "bookkeep",
    label: "Bookkeeper",
    icon: "📒",
    description: "Automated double-entry booking, GL classification, and journal-to-ledger reconciliation.",
    colorClass: "text-emerald-400",
  },
  {
    id: "reconcile",
    label: "Reconciler",
    icon: "⚖️",
    description: "Bank-to-book matching, variance identification, and 3-way reconciliation across sub-ledgers.",
    colorClass: "text-blue-400",
  },
  {
    id: "statements",
    label: "Statement Generator",
    icon: "📊",
    description: "P&L, Balance Sheet, Cash Flow statements — GAAP/IFRS-compliant with period comparison and drill-down.",
    colorClass: "text-violet-400",
  },
  {
    id: "tax",
    label: "Tax Compliance",
    icon: "🏛️",
    description: "Tax provision calculation, multi-jurisdiction compliance checks, and deferred tax tracking.",
    colorClass: "text-orange-400",
  },
  {
    id: "audit",
    label: "Audit Preparer",
    icon: "🔎",
    description: "Audit-ready workpaper generation, control testing documentation, and sampling evidence packages.",
    colorClass: "text-pink-400",
  },
  {
    id: "anomaly",
    label: "Anomaly Detective",
    icon: "🔮",
    description: "Benford's Law analysis, outlier detection, trend breaks, and causal anomaly explanation via Brain L4.",
    colorClass: "text-red-400",
  },
];

/** id → label for AAAS agent lookups */
export const AAAS_AGENT_LABEL_MAP: Record<string, { label: string; icon: string }> =
  Object.fromEntries(
    AAAS_AGENT_CATALOGUE.map((a) => [a.id, { label: a.label, icon: a.icon }])
  );

/** All domain IDs (SE-aaS + AAAS) */
export const ALL_DOMAIN_IDS = [
  ...DOMAIN_CATALOGUE.map((d) => d.id),
  ...AAAS_AGENT_CATALOGUE.map((a) => a.id),
];

/** Category grouping helper for marketplace grids */
export function groupByCategory<T extends { category?: string }>(
  items: T[]
): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = item.category ?? "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}
