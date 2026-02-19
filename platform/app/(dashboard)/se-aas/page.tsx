/**
 * SE-AAS Dashboard — Software Engineering as a Service
 * =====================================================
 *
 * Service marketplace view for all 17 SE-AAS capabilities:
 * - Workspace/branch context card (brain-highlight variant)
 * - P0 live Early Warning summary cards with score bars
 * - Domain catalogue grouped by category (Card + Badge UI)
 * - Recent artifacts with domain colour coding
 * - Copilot deep-links per domain
 *
 * Visually aligned with overview/page.tsx and brain/page.tsx design language.
 * Uses: Card, CardHeader, CardTitle, CardDescription, Badge from component library.
 */

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";
export const metadata = { title: "SE-AAS · Engineering Intelligence" };

// ── Domain catalogue ────────────────────────────────────────────────────────

type DomainEntry = {
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

const DOMAIN_CATALOGUE: DomainEntry[] = [
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
    badge: "New",
    badgeVariant: "accent",
    colorClass: "text-sky-400",
    ringClass: "border-sky-500/25",
    bgClass: "bg-sky-500/5",
  },
];

const DOMAIN_LABEL_MAP = Object.fromEntries(
  DOMAIN_CATALOGUE.map((d) => [
    d.id,
    { label: d.label, icon: d.icon, colorClass: d.colorClass, bgClass: d.bgClass },
  ])
);

// ── Page ────────────────────────────────────────────────────────────────────

export default async function SeAaSDashboardPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

  // Workspace / Branch context
  const { data: githubConnector } = await supabase
    .from("org_connectors")
    .select("config")
    .eq("organization_id", orgId)
    .eq("connector_type", "github")
    .limit(1)
    .maybeSingle();

  const primaryBranch: string | null = githubConnector?.config?.primaryBranch ?? null;
  const releaseVersion: string | null = primaryBranch
    ? (githubConnector?.config?.releaseVersionMap?.[primaryBranch] ?? null)
    : null;
  const githubRepo: string | null = githubConnector?.config?.githubRepo ?? null;
  const isConnected = !!githubConnector;

  // P0 snapshots
  const { data: latestVelocity } = await supabase
    .from("velocity_snapshots")
    .select("prs_merged, collapse_probability, model_confidence, branch_name")
    .eq("organization_id", orgId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: latestBottleneck } = await supabase
    .from("bottleneck_snapshots")
    .select("risk_level, bottleneck_risk_score, top_reviewer, top_reviewer_share, reviewer_hhi")
    .eq("organization_id", orgId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Active jobs
  const { data: activeJobs } = await supabase
    .from("agent_queue")
    .select("id, task_type, status, created_at")
    .eq("organization_id", orgId)
    .eq("agent_type", "se-aas")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(5);

  // Recent artifacts
  const { data: recentArtifacts } = await supabase
    .from("se_aas_artifacts")
    .select("id, domain_type, created_at, artifact_data")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(8);

  const { count: artifactCount } = await supabase
    .from("se_aas_artifacts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  // Group by category
  const grouped = DOMAIN_CATALOGUE.reduce<Record<string, DomainEntry[]>>((acc, d) => {
    (acc[d.category] ??= []).push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-xl font-semibold tracking-tight">Engineering Intelligence</h1>
            <Badge variant="accent" size="xs">SE-AAS</Badge>
          </div>
          <p className="text-xs text-muted">
            17 Brain-augmented capabilities · all signals scoped to this workspace
          </p>
        </div>
        <Link
          href="/copilot?service=seaas"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Open Copilot
        </Link>
      </div>

      {/* ── Workspace / Branch context card ─────────────────────────────── */}
      <Card
        variant={isConnected ? "brain-highlight" : "default"}
        padding="md"
        className={isConnected ? "bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent" : ""}
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
            isConnected
              ? "bg-emerald-500/10 border border-emerald-500/20"
              : "bg-surface border border-border-subtle"
          }`}>
            {isConnected ? "🌿" : "🔌"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="text-sm font-medium">
                {isConnected ? "Workspace connected" : "No GitHub connected"}
              </span>
              {primaryBranch && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082" />
                  </svg>
                  {primaryBranch}
                </span>
              )}
              {releaseVersion && (
                <Badge variant="info" size="xs">v{releaseVersion}</Badge>
              )}
              {githubRepo && (
                <Badge variant="outline" size="xs" className="font-mono">{githubRepo}</Badge>
              )}
            </div>
            <p className="text-xs text-muted leading-relaxed">
              {isConnected
                ? "All 17 SE-AAS capabilities are scoped to this workspace. Brain signals, causal graphs, and artifacts are fully isolated per workspace-org."
                : "Connect your GitHub repository to unlock velocity analysis, bottleneck detection, and branch-scoped intelligence."}
            </p>
          </div>
          {!isConnected && (
            <Link
              href="/connectors"
              className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-xs font-medium transition-colors shrink-0"
            >
              Connect →
            </Link>
          )}
        </div>
      </Card>

      {/* ── P0 Early Warning live summary ───────────────────────────────── */}
      {(latestVelocity || latestBottleneck) && (
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">P0 Live · Early Warning</h2>
            <div className="flex-1 h-px bg-border-subtle" />
            <Link href="/early-warning" className="text-[11px] text-accent hover:text-accent/80 font-medium">
              Full report →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {latestVelocity && (
              <Link href="/early-warning" className="block">
                <Card
                  variant="interactive"
                  padding="md"
                  className={(latestVelocity.collapse_probability ?? 0) > 0.5
                    ? "border-danger/40 bg-danger/5 hover:border-danger/60"
                    : ""}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">⚡</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Velocity</span>
                    {(latestVelocity.collapse_probability ?? 0) > 0.5 ? (
                      <Badge variant="danger" size="xs" pulse className="ml-auto">Collapse Risk</Badge>
                    ) : (
                      <Badge variant="success" size="xs" className="ml-auto">Healthy</Badge>
                    )}
                  </div>
                  <div className="text-2xl font-bold tabular-nums">{latestVelocity.prs_merged ?? 0}</div>
                  <div className="text-xs text-muted mt-0.5">
                    PRs merged · last 7d
                    {latestVelocity.branch_name && (
                      <span className="ml-1 font-mono text-emerald-400">({latestVelocity.branch_name})</span>
                    )}
                  </div>
                  {latestVelocity.collapse_probability != null && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-surface-raised rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            latestVelocity.collapse_probability > 0.5 ? "bg-danger" : "bg-success"
                          }`}
                          style={{ width: `${(latestVelocity.collapse_probability * 100).toFixed(0)}%` }}
                        />
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums shrink-0 ${
                        latestVelocity.collapse_probability > 0.5 ? "text-danger" : "text-success"
                      }`}>
                        {(latestVelocity.collapse_probability * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </Card>
              </Link>
            )}

            {latestBottleneck && (
              <Link href="/early-warning" className="block">
                <Card
                  variant="interactive"
                  padding="md"
                  className={latestBottleneck.risk_level === "high"
                    ? "border-warning/40 bg-warning/5 hover:border-warning/60"
                    : ""}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">🎯</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Bottleneck Risk</span>
                    {latestBottleneck.risk_level === "high" && (
                      <Badge variant="warning" size="xs" pulse className="ml-auto">High Risk</Badge>
                    )}
                    {latestBottleneck.risk_level === "medium" && (
                      <Badge variant="warning" size="xs" className="ml-auto">Medium</Badge>
                    )}
                    {latestBottleneck.risk_level === "low" && (
                      <Badge variant="success" size="xs" className="ml-auto">Low Risk</Badge>
                    )}
                    {!latestBottleneck.risk_level && (
                      <Badge variant="default" size="xs" className="ml-auto">Unknown</Badge>
                    )}
                  </div>
                  <div className="text-2xl font-bold tabular-nums">
                    {latestBottleneck.bottleneck_risk_score?.toFixed(0) ?? "—"}
                    <span className="text-sm font-normal text-muted">/100</span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    HHI {latestBottleneck.reviewer_hhi?.toFixed(3) ?? "—"} ·{" "}
                    {latestBottleneck.top_reviewer
                      ? `${latestBottleneck.top_reviewer} ${((latestBottleneck.top_reviewer_share ?? 0) * 100).toFixed(0)}% reviews`
                      : "No reviewer data"}
                  </div>
                  {latestBottleneck.bottleneck_risk_score != null && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-surface-raised rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            latestBottleneck.risk_level === "high"
                              ? "bg-danger"
                              : latestBottleneck.risk_level === "medium"
                              ? "bg-warning"
                              : "bg-success"
                          }`}
                          style={{ width: `${latestBottleneck.bottleneck_risk_score}%` }}
                        />
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums shrink-0 ${
                        latestBottleneck.risk_level === "high"
                          ? "text-danger"
                          : latestBottleneck.risk_level === "medium"
                          ? "text-warning"
                          : "text-success"
                      }`}>
                        {latestBottleneck.bottleneck_risk_score?.toFixed(0)}
                      </span>
                    </div>
                  )}
                </Card>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* ── Active Jobs ──────────────────────────────────────────────────── */}
      {activeJobs && activeJobs.length > 0 && (
        <Card variant="elevated" padding="md">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="accent" size="xs" pulse>Active</Badge>
            <span className="text-xs font-medium">Running Jobs ({activeJobs.length})</span>
          </div>
          <div className="space-y-2">
            {activeJobs.map((job) => {
              const info = DOMAIN_LABEL_MAP[job.task_type];
              return (
                <div key={job.id} className="flex items-center gap-3 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    job.status === "running" ? "bg-accent animate-pulse" : "bg-muted"
                  }`} />
                  <span className="text-base leading-none shrink-0">{info?.icon ?? "📄"}</span>
                  <span className="font-medium">{info?.label ?? job.task_type}</span>
                  <Badge variant={job.status === "running" ? "accent" : "default"} size="xs">
                    {job.status}
                  </Badge>
                  <span className="text-muted ml-auto font-mono">
                    {new Date(job.created_at).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <Link href={`/se-aas/artifacts?jobId=${job.id}`} className="text-accent hover:underline shrink-0">
                    track →
                  </Link>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Domain Catalogue ─────────────────────────────────────────────── */}
      {Object.entries(grouped).map(([category, domains]) => (
        <section key={category}>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap">
              {category}
            </h2>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {domains.map((domain) => {
              const cardInner = (
                <Card
                  variant="interactive"
                  padding="md"
                  className={`h-full flex flex-col gap-3 ${domain.ringClass} ${domain.bgClass} group`}
                >
                  {/* Header row: icon + label + optional badge */}
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center text-xl shrink-0 bg-surface/60 ${domain.ringClass}`}>
                      {domain.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold leading-tight">{domain.label}</span>
                        {domain.badge && (
                          <Badge
                            variant={domain.badgeVariant ?? "accent"}
                            size="xs"
                            pulse={domain.badgePulse}
                          >
                            {domain.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted leading-relaxed line-clamp-3">
                        {domain.description}
                      </p>
                    </div>
                  </div>

                  {/* CTA footer */}
                  <div className="mt-auto pt-2.5 border-t border-border-subtle/50 flex items-center justify-between">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${domain.colorClass}`}>
                      {domain.href ? "View Dashboard" : "Ask in Copilot"}
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 ${domain.colorClass}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </Card>
              );

              if (domain.href) {
                return (
                  <Link key={domain.id} href={domain.href} className="block">
                    {cardInner}
                  </Link>
                );
              }
              if (domain.copilotPrompt) {
                return (
                  <Link
                    key={domain.id}
                    href={`/copilot?service=seaas&q=${encodeURIComponent(domain.copilotPrompt)}`}
                    className="block"
                  >
                    {cardInner}
                  </Link>
                );
              }
              return <div key={domain.id}>{cardInner}</div>;
            })}
          </div>
        </section>
      ))}

      {/* ── Recent Artifacts ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Recent Artifacts</h2>
          <div className="flex-1 h-px bg-border-subtle" />
          {(artifactCount ?? 0) > 0 && (
            <Link href="/se-aas/artifacts" className="text-[11px] text-accent hover:text-accent/80 font-medium shrink-0">
              View all {artifactCount} →
            </Link>
          )}
        </div>

        <Card variant="default" padding="none">
          {recentArtifacts && recentArtifacts.length > 0 ? (
            <div className="divide-y divide-border-subtle">
              {recentArtifacts.map((artifact) => {
                const info = DOMAIN_LABEL_MAP[artifact.domain_type];
                const data = artifact.artifact_data as Record<string, any>;
                const confidence = data?.confidence ?? data?.overallScore ?? null;
                const narrative =
                  data?.narrative ?? data?.summary ?? data?.answer
                    ?? (typeof data?.fullMarkdown === "string" ? data.fullMarkdown.slice(0, 80) : null)
                    ?? null;

                return (
                  <Link
                    key={artifact.id}
                    href={`/se-aas/artifacts/${artifact.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface/50 transition-colors"
                  >
                    {/* Domain icon */}
                    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center text-base shrink-0 border-border-subtle ${info?.bgClass ?? "bg-surface"}`}>
                      {info?.icon ?? "📄"}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium">{info?.label ?? artifact.domain_type}</span>
                        <Badge
                          variant="default"
                          size="xs"
                          className={`font-mono ${info?.colorClass ?? "text-muted"}`}
                        >
                          {artifact.domain_type}
                        </Badge>
                        {confidence != null && (
                          <span className="ml-auto text-[10px] text-muted tabular-nums shrink-0">
                            {typeof confidence === "number" && confidence <= 1
                              ? `${(confidence * 100).toFixed(0)}% confidence`
                              : `score ${confidence}`}
                          </span>
                        )}
                      </div>
                      {narrative && (
                        <p className="text-xs text-muted truncate">{narrative}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted font-mono">{artifact.id.slice(0, 8)}…</span>
                        <span className="text-[10px] text-muted">
                          {new Date(artifact.created_at).toLocaleString("en-US", {
                            month: "short", day: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>

                    <svg
                      className="w-4 h-4 text-muted shrink-0"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="p-10">
              <EmptyState
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                }
                title="No artifacts yet"
                description="Use any SE-AAS capability through the Copilot to generate your first artifact."
              />
            </div>
          )}
        </Card>
      </section>

    </div>
  );
}
