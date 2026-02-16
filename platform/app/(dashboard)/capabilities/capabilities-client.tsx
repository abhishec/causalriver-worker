"use client";

import { useState } from "react";
import Link from "next/link";

/* ── Capability Definitions (All 15 P1 Use Cases) ──────────────────────────── */

interface Capability {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  description: string;
  status: "live" | "copilot" | "coming-soon";
  domainType?: string; // SE-aaS domain_type for artifact counting
  examplePrompts: string[];
  dataRequired: string[];
  brainIntegration: string;
  icon: string;
}

const CAPABILITIES: Capability[] = [
  // ── 1. Development Speed ────────────────────────────────────────────────────
  {
    id: "tdd-code-gen",
    name: "TDD Code Generator",
    category: "speed",
    categoryLabel: "Development Speed",
    description:
      "Accelerate feature development with Test-Driven Development. Generates tests first, then writes code to satisfy them with iterative refinement.",
    status: "live",
    domainType: "tdd",
    examplePrompts: [
      "Write TDD code for a user authentication service",
      "Generate tests and implementation for a payment processing module",
      "Implement a caching layer with TDD approach",
    ],
    dataRequired: ["Feature requirements or user story", "Target language/framework"],
    brainIntegration:
      "Brain provides codebase patterns, known failure modes, and test coverage gaps from historical data.",
    icon: "🧪",
  },
  {
    id: "boilerplate-scaffold",
    name: "Boilerplate & Scaffolding Generator",
    category: "speed",
    categoryLabel: "Development Speed",
    description:
      "Eliminate repetitive code setup. Generates project scaffolding, CRUD operations, API endpoints, and boilerplate following company standards.",
    status: "copilot",
    examplePrompts: [
      "Generate a new API endpoint for user management with CRUD",
      "Scaffold a new microservice with logging, error handling, and metrics",
      "Create a React component with tests and Storybook",
    ],
    dataRequired: ["Codebase context", "Company coding standards"],
    brainIntegration:
      "Brain analyzes existing codebase patterns to ensure generated code matches your team's conventions.",
    icon: "🏗️",
  },
  {
    id: "pr-review",
    name: "PR Review & Iteration Assistant",
    category: "speed",
    categoryLabel: "Development Speed",
    description:
      "Speed up code review cycles. Auto-reviews PRs for bugs, security issues, style violations and suggests improvements with code snippets.",
    status: "copilot",
    examplePrompts: [
      "Review this PR for security issues and performance",
      "Check test coverage on changed code in PR #245",
      "Suggest improvements for the authentication changes",
    ],
    dataRequired: ["GitHub connection", "PR diff data"],
    brainIntegration:
      "Brain correlates review patterns with downstream incidents to flag high-risk changes.",
    icon: "👁️",
  },
  {
    id: "dependency-upgrade",
    name: "Dependency Upgrade Assistant",
    category: "speed",
    categoryLabel: "Development Speed",
    description:
      "Keep dependencies current without breaking changes. Identifies outdated packages, analyzes breaking changes, and generates migration code.",
    status: "live",
    domainType: "dependency-upgrade",
    examplePrompts: [
      "Check for outdated dependencies in my project",
      "Analyze breaking changes if I upgrade React to v19",
      "Generate migration code for the Express 5 upgrade",
    ],
    dataRequired: ["package.json / requirements.txt", "Current codebase"],
    brainIntegration:
      "Brain tracks which upgrades historically caused incidents and warns about risky version jumps.",
    icon: "📦",
  },
  {
    id: "design-doc",
    name: "HLD/LLD Document Generator",
    category: "speed",
    categoryLabel: "Development Speed",
    description:
      "Generate and maintain design documents. Forward mode: requirements to design. Reverse mode: code to design extraction for legacy systems.",
    status: "live",
    domainType: "design-doc",
    examplePrompts: [
      "Generate an HLD for our new payment processing system",
      "Reverse-engineer a design doc from this codebase",
      "Create an LLD with sequence diagrams for the auth flow",
    ],
    dataRequired: ["Requirements/PRD or existing codebase", "System context"],
    brainIntegration:
      "Brain detects drift between design docs and implementation, flags architectural deviations.",
    icon: "📐",
  },

  // ── 2. Development Accuracy ─────────────────────────────────────────────────
  {
    id: "data-lineage",
    name: "Data Model Lineage Mapper",
    category: "accuracy",
    categoryLabel: "Development Accuracy",
    description:
      "Understand data flow and column population sources across the system. Shows complete lineage from source through transformations to destination.",
    status: "live",
    domainType: "lineage",
    examplePrompts: [
      "Show the data lineage for the users.subscription_status column",
      "Map all transformations from raw events to analytics tables",
      "Identify where customer_id gets populated across services",
    ],
    dataRequired: ["DB schemas", "ETL code", "Service code"],
    brainIntegration:
      "Brain discovers cross-domain data dependencies and flags inconsistencies in data population.",
    icon: "🔗",
  },
  {
    id: "impact-analysis",
    name: "Impact Analysis Agent",
    category: "accuracy",
    categoryLabel: "Development Accuracy",
    description:
      "Predict ripple effects of code changes before making them. Maps dependent code paths, downstream systems, and suggests additional test coverage.",
    status: "live",
    domainType: "impact",
    examplePrompts: [
      "What's the blast radius if I change the User model schema?",
      "Analyze impact of removing the legacy auth middleware",
      "Which services break if I modify the payment webhook handler?",
    ],
    dataRequired: ["Codebase access", "Service dependency graph"],
    brainIntegration:
      "Brain uses causal graph to predict downstream business impact (not just code dependencies).",
    icon: "💥",
  },
  {
    id: "sql-analyzer",
    name: "SQL Query Analyzer",
    category: "accuracy",
    categoryLabel: "Development Accuracy",
    description:
      "Ensure correct and performant database queries. Analyzes correctness against schema, identifies N+1 problems, suggests optimizations.",
    status: "live",
    domainType: "sql-analyze",
    examplePrompts: [
      "Analyze this SQL query for performance issues",
      "Check for missing indexes in these queries",
      "Identify SQL injection vulnerabilities in this code",
    ],
    dataRequired: ["SQL queries", "Database schema"],
    brainIntegration:
      "Brain correlates slow queries with production incidents to prioritize optimizations.",
    icon: "🗃️",
  },

  // ── 3. Production Support ───────────────────────────────────────────────────
  {
    id: "log-query",
    name: "Log Query & Analysis Agent",
    category: "production",
    categoryLabel: "Production Support",
    description:
      "Accelerate root cause analysis during incidents. Accepts natural language, translates to log query syntax, correlates across services.",
    status: "live",
    domainType: "log-query",
    examplePrompts: [
      "Show me errors for user X in the last hour",
      "Find all 500 errors in the payment service today",
      "Correlate auth failures with the deploy at 2pm",
    ],
    dataRequired: ["Log infrastructure access", "Service metadata"],
    brainIntegration:
      "Brain surfaces similar past incidents and learned root cause patterns from organizational history.",
    icon: "📋",
  },
  {
    id: "incident-diagnosis",
    name: "Incident Diagnosis Assistant",
    category: "production",
    categoryLabel: "Production Support",
    description:
      "Reduce MTTR for production issues. Aggregates signals from logs, metrics, traces, and alerts. Builds incident timeline and suggests mitigations.",
    status: "live",
    domainType: "incident",
    examplePrompts: [
      "Diagnose why the checkout service is timing out",
      "Build a timeline of events leading to the outage",
      "What's the blast radius of the current database issue?",
    ],
    dataRequired: ["Monitoring data", "Service topology", "Alert history"],
    brainIntegration:
      "Brain links incidents to causal chains: deploy → error spike → customer churn, with statistical confidence.",
    icon: "🚨",
  },
  {
    id: "performance-profile",
    name: "Performance Profiler",
    category: "production",
    categoryLabel: "Production Support",
    description:
      "Identify and resolve performance bottlenecks. Analyzes APM data, pinpoints slow endpoints and queries, suggests optimization strategies.",
    status: "live",
    domainType: "performance-profile",
    examplePrompts: [
      "Profile the /api/checkout endpoint for performance issues",
      "Identify the slowest database queries in production",
      "Suggest optimizations for the report generation pipeline",
    ],
    dataRequired: ["APM data", "Trace data", "Query logs"],
    brainIntegration:
      "Brain predicts performance degradation impact on business metrics (conversion rate, user satisfaction).",
    icon: "⚡",
  },

  // ── 4. Code Understanding & Modernization ───────────────────────────────────
  {
    id: "codebase-qa",
    name: "Codebase Q&A Agent",
    category: "understanding",
    categoryLabel: "Code Understanding",
    description:
      "Understand unfamiliar code quickly. Answer natural language questions about the codebase, explain complex functions, show code flow for scenarios.",
    status: "copilot",
    examplePrompts: [
      "How does the payment processing pipeline work?",
      "Where is the user authentication logic implemented?",
      "Explain the order fulfillment state machine",
    ],
    dataRequired: ["Codebase indexed via GitHub connector"],
    brainIntegration:
      "Brain provides organizational context — who owns what code, historical change patterns, known issues.",
    icon: "❓",
  },
  {
    id: "dead-code",
    name: "Dead Code Detector",
    category: "understanding",
    categoryLabel: "Code Understanding",
    description:
      "Identify and safely remove unused code. Analyzes code usage, tracks runtime usage, finds unused dependencies, generates safe removal suggestions.",
    status: "live",
    domainType: "dead-code",
    examplePrompts: [
      "Find dead code in the authentication module",
      "Identify unused exports across the project",
      "Which dependencies are no longer used?",
    ],
    dataRequired: ["Codebase access", "Import/export analysis"],
    brainIntegration:
      "Brain tracks code usage patterns over time to distinguish truly dead code from rarely-used emergency paths.",
    icon: "🧹",
  },

  // ── 5. Testing & Quality ────────────────────────────────────────────────────
  {
    id: "test-cases",
    name: "Test Case Generator",
    category: "testing",
    categoryLabel: "Testing & Quality",
    description:
      "Increase test coverage efficiently. Analyzes code to identify gaps, generates unit tests, creates integration scenarios and edge case tests.",
    status: "live",
    domainType: "test-cases",
    examplePrompts: [
      "Generate test cases for the UserService class",
      "Create integration tests for the checkout flow",
      "Write edge case tests for the date parsing utility",
    ],
    dataRequired: ["Source code", "Existing test suite"],
    brainIntegration:
      "Brain identifies which code paths have historically caused production issues — prioritizes test generation there.",
    icon: "✅",
  },
  {
    id: "test-data",
    name: "Test Data Generator",
    category: "testing",
    categoryLabel: "Testing & Quality",
    description:
      "Generate realistic test data fixtures. Creates mock data matching your schemas, seeds databases for testing, and generates edge case data.",
    status: "live",
    domainType: "test-data",
    examplePrompts: [
      "Generate test data for a user with multiple subscriptions",
      "Create seed data for the e-commerce test environment",
      "Generate edge case data for the billing calculation tests",
    ],
    dataRequired: ["Database schema", "Data model definitions"],
    brainIntegration:
      "Brain uses real data distribution patterns to generate statistically realistic test data.",
    icon: "🎲",
  },
];

const CATEGORY_ORDER = ["speed", "accuracy", "production", "understanding", "testing"];

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  speed: { bg: "bg-blue-500/5", border: "border-blue-500/20", text: "text-blue-400" },
  accuracy: { bg: "bg-emerald-500/5", border: "border-emerald-500/20", text: "text-emerald-400" },
  production: { bg: "bg-amber-500/5", border: "border-amber-500/20", text: "text-amber-400" },
  understanding: { bg: "bg-purple-500/5", border: "border-purple-500/20", text: "text-purple-400" },
  testing: { bg: "bg-cyan-500/5", border: "border-cyan-500/20", text: "text-cyan-400" },
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  live: { label: "SE-aaS Live", className: "bg-success/10 text-success" },
  copilot: { label: "Via Copilot", className: "bg-accent/10 text-accent" },
  "coming-soon": { label: "Coming Soon", className: "bg-surface text-muted" },
};

/* ── Component ──────────────────────────────────────────────────────────────── */

interface CapabilitiesClientProps {
  domainCounts: Record<string, number>;
  recentArtifacts: Array<{
    id: string;
    domain_type: string;
    created_at: string;
    metadata: any;
  }>;
  activeJobs: Array<{
    id: string;
    task_type: string;
    status: string;
    created_at: string;
  }>;
}

export function CapabilitiesClient({
  domainCounts,
  recentArtifacts,
  activeJobs,
}: CapabilitiesClientProps) {
  const [filter, setFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredCapabilities =
    filter === "all"
      ? CAPABILITIES
      : CAPABILITIES.filter((c) => c.category === filter);

  // Group by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CAPABILITIES.find((c) => c.category === cat)?.categoryLabel || cat,
    items: filteredCapabilities.filter((c) => c.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {/* Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg bg-card border border-border-subtle p-3">
          <div className="text-xl font-bold tabular-nums">15</div>
          <div className="text-[10px] text-muted uppercase tracking-wider">Total Capabilities</div>
        </div>
        <div className="rounded-lg bg-card border border-border-subtle p-3">
          <div className="text-xl font-bold tabular-nums text-success">
            {CAPABILITIES.filter((c) => c.status === "live").length}
          </div>
          <div className="text-[10px] text-muted uppercase tracking-wider">SE-aaS Live</div>
        </div>
        <div className="rounded-lg bg-card border border-border-subtle p-3">
          <div className="text-xl font-bold tabular-nums">
            {Object.values(domainCounts).reduce((a, b) => a + b, 0)}
          </div>
          <div className="text-[10px] text-muted uppercase tracking-wider">Artifacts Generated</div>
        </div>
        <div className="rounded-lg bg-card border border-border-subtle p-3">
          <div className="text-xl font-bold tabular-nums text-accent">
            {activeJobs.length}
          </div>
          <div className="text-[10px] text-muted uppercase tracking-wider">Active Jobs</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          { key: "all", label: "All" },
          { key: "speed", label: "Dev Speed" },
          { key: "accuracy", label: "Accuracy" },
          { key: "production", label: "Production" },
          { key: "understanding", label: "Code Understanding" },
          { key: "testing", label: "Testing" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === tab.key
                ? "bg-accent text-accent-foreground"
                : "bg-surface text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Capability Cards by Category */}
      {grouped.map((group) => (
        <div key={group.category} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">{group.label}</h2>
            <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded">
              {group.items.length} capabilities
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.items.map((cap) => {
              const colors = CATEGORY_COLORS[cap.category];
              const badge = STATUS_BADGES[cap.status];
              const artifactCount = cap.domainType
                ? domainCounts[cap.domainType] || 0
                : 0;
              const isExpanded = expandedId === cap.id;
              const hasActiveJob = activeJobs.some(
                (j) => j.task_type === cap.domainType
              );

              return (
                <div
                  key={cap.id}
                  className={`rounded-xl border p-4 transition-all cursor-pointer ${
                    colors.bg
                  } ${colors.border} ${
                    isExpanded ? "ring-1 ring-accent/30" : "hover:ring-1 hover:ring-border"
                  }`}
                  onClick={() =>
                    setExpandedId(isExpanded ? null : cap.id)
                  }
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cap.icon}</span>
                      <h3 className="text-sm font-medium leading-tight">
                        {cap.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {hasActiveJob && (
                        <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                      )}
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-muted leading-relaxed mb-3">
                    {cap.description}
                  </p>

                  {/* Bottom stats */}
                  <div className="flex items-center gap-3 text-[10px] text-muted">
                    {artifactCount > 0 && (
                      <span>
                        {artifactCount} artifact{artifactCount > 1 ? "s" : ""}
                      </span>
                    )}
                    <span className={colors.text}>
                      {cap.status === "live"
                        ? "API + Copilot"
                        : cap.status === "copilot"
                        ? "Copilot NL"
                        : "Planned"}
                    </span>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="mt-4 pt-3 border-t border-border-subtle space-y-3">
                      {/* Example Prompts */}
                      <div>
                        <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1.5">
                          Try in Copilot
                        </div>
                        <div className="space-y-1">
                          {cap.examplePrompts.map((prompt, i) => (
                            <Link
                              key={i}
                              href={`/copilot?q=${encodeURIComponent(prompt)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="block text-xs text-foreground hover:text-accent transition-colors p-1.5 rounded bg-surface/50 hover:bg-surface"
                            >
                              &quot;{prompt}&quot;
                            </Link>
                          ))}
                        </div>
                      </div>

                      {/* Brain Integration */}
                      <div>
                        <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">
                          Brain Integration
                        </div>
                        <p className="text-xs text-muted">
                          {cap.brainIntegration}
                        </p>
                      </div>

                      {/* Data Required */}
                      <div>
                        <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">
                          Data Required
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {cap.dataRequired.map((d, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] bg-surface text-muted"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* API Endpoint (for live SE-aaS) */}
                      {cap.status === "live" && cap.domainType && (
                        <div>
                          <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">
                            API Endpoint
                          </div>
                          <code className="text-[10px] font-mono text-accent bg-surface px-2 py-1 rounded block">
                            POST /api/se-aas/{cap.domainType}
                          </code>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Recent Artifacts */}
      {recentArtifacts.length > 0 && (
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-3">Recent Artifacts</h3>
          <div className="space-y-2">
            {recentArtifacts.slice(0, 5).map((artifact) => {
              const cap = CAPABILITIES.find(
                (c) => c.domainType === artifact.domain_type
              );
              return (
                <div
                  key={artifact.id}
                  className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{cap?.icon || "📄"}</span>
                    <div>
                      <div className="text-xs font-medium">
                        {cap?.name || artifact.domain_type}
                      </div>
                      <div className="text-[10px] text-muted">
                        {new Date(artifact.created_at).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted font-mono">
                    {artifact.id.slice(0, 8)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cross-System Data Info */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-500/5 to-purple-500/5 border border-indigo-500/20 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center text-xs">
            🧠
          </div>
          <h3 className="text-sm font-medium">
            Brain-Powered Cross-System Intelligence
          </h3>
        </div>
        <p className="text-xs text-muted leading-relaxed mb-3">
          Every capability is enhanced by the Brain&apos;s causal knowledge graph.
          Connect your tools to unlock cross-system intelligence that no single
          tool provides alone.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { icon: "🐙", label: "GitHub", desc: "PRs, reviews, deploys" },
            { icon: "📋", label: "Jira", desc: "Tickets, sprints" },
            { icon: "💬", label: "Slack", desc: "Team communication" },
            { icon: "💳", label: "Stripe", desc: "Revenue signals" },
          ].map((c) => (
            <Link
              key={c.label}
              href="/connectors"
              className="flex items-center gap-2 p-2 rounded-lg bg-surface/50 hover:bg-surface transition-colors"
            >
              <span>{c.icon}</span>
              <div>
                <div className="text-xs font-medium">{c.label}</div>
                <div className="text-[9px] text-muted">{c.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
