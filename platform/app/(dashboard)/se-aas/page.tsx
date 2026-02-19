/**
 * SE-AAS Dashboard — Software Engineering as a Service
 * =====================================================
 *
 * Surfaces all 17 SE-AAS capabilities with:
 * - Workspace/branch context badge (which branch this org monitors)
 * - Recent artifacts across all domains
 * - Quick-launch cards for every domain
 * - Copilot integration with SE-AAS mode pre-selected
 *
 * Architecture: All data is org-scoped (organization_id).
 * The workspace = branch mapping is resolved from org_connectors.primaryBranch.
 */

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";
export const metadata = { title: "SE-AAS · Engineering Intelligence" };

// ── Domain catalogue ────────────────────────────────────────────────────────

const DOMAIN_CATALOGUE = [
  // P0 — Delivery Intelligence
  {
    id: "early-warning",
    label: "Early Warning",
    icon: "⚡",
    category: "P0 · Delivery Intelligence",
    description: "Velocity collapse prediction + SPOF bottleneck risk (Gini, HHI, Betweenness Centrality)",
    href: "/early-warning",
    color: "text-red-400",
    bgColor: "bg-red-500/8",
    borderColor: "border-red-500/20",
    badge: "Live",
  },
  // P1 — Code Intelligence
  {
    id: "pr-review",
    label: "PR Review",
    icon: "🔍",
    category: "P1 · Code Intelligence",
    description: "Brain-augmented code review with causal cascade impact — see how this PR ripples through NPS and revenue",
    copilotPrompt: "Review my latest PR diff and show me the causal business impact",
    color: "text-blue-400",
    bgColor: "bg-blue-500/8",
    borderColor: "border-blue-500/20",
  },
  {
    id: "tdd",
    label: "TDD Agent",
    icon: "🧪",
    category: "P1 · Code Intelligence",
    description: "Red-Green-Refactor cycle: auto-generate unit + integration tests with coverage estimation",
    copilotPrompt: "Generate TDD tests for my code using the Red-Green-Refactor cycle",
    color: "text-green-400",
    bgColor: "bg-green-500/8",
    borderColor: "border-green-500/20",
  },
  {
    id: "boilerplate",
    label: "Scaffolding",
    icon: "🏗️",
    category: "P1 · Code Intelligence",
    description: "Generate production-ready boilerplate: REST API, microservice, React component, CLI tool",
    copilotPrompt: "Generate a production-ready TypeScript REST API scaffold",
    color: "text-purple-400",
    bgColor: "bg-purple-500/8",
    borderColor: "border-purple-500/20",
  },
  {
    id: "dependency-upgrade",
    label: "Dep Upgrade",
    icon: "📦",
    category: "P1 · Code Intelligence",
    description: "Audit outdated packages, detect breaking changes, generate migration steps with risk scores",
    copilotPrompt: "Audit my package.json for outdated dependencies and security issues",
    color: "text-orange-400",
    bgColor: "bg-orange-500/8",
    borderColor: "border-orange-500/20",
  },
  {
    id: "design-doc",
    label: "HLD / LLD",
    icon: "📐",
    category: "P1 · Code Intelligence",
    description: "Forward (requirements → design) or reverse (code → design) HLD/LLD with Mermaid diagrams",
    copilotPrompt: "Generate an HLD and LLD for my system with Mermaid architecture diagrams",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/8",
    borderColor: "border-cyan-500/20",
  },
  // P1 — Test Intelligence
  {
    id: "test-cases",
    label: "Test Cases",
    icon: "✅",
    category: "P1 · Test Intelligence",
    description: "Generate comprehensive test suites from code analysis — edge cases, boundary conditions, integration paths",
    copilotPrompt: "Generate a comprehensive test suite for my codebase covering edge cases",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/8",
    borderColor: "border-emerald-500/20",
  },
  {
    id: "test-data",
    label: "Test Data",
    icon: "🎲",
    category: "P1 · Test Intelligence",
    description: "Synthetic test data generation with referential integrity, PII-safe, scenario-based datasets",
    copilotPrompt: "Generate realistic synthetic test data for my database schema",
    color: "text-teal-400",
    bgColor: "bg-teal-500/8",
    borderColor: "border-teal-500/20",
  },
  // SWE Gap Closure
  {
    id: "codebase-qa",
    label: "Codebase Q&A",
    icon: "💬",
    category: "SWE · Codebase Understanding",
    description: "Ask natural language questions about your codebase — Brain-augmented with learned patterns",
    copilotPrompt: "Explain how the authentication system works in our codebase",
    color: "text-violet-400",
    bgColor: "bg-violet-500/8",
    borderColor: "border-violet-500/20",
  },
  {
    id: "dead-code",
    label: "Dead Code",
    icon: "🧹",
    category: "SWE · Codebase Understanding",
    description: "Identify unreachable functions, unused imports, dead files — safe removal with confidence scores",
    copilotPrompt: "Find all dead code, unused imports, and unreachable functions in my codebase",
    color: "text-gray-400",
    bgColor: "bg-gray-500/8",
    borderColor: "border-gray-500/20",
  },
  {
    id: "impact",
    label: "Impact Analysis",
    icon: "💥",
    category: "SWE · Codebase Understanding",
    description: "What breaks if I change module X? Blast radius analysis across the dependency graph",
    copilotPrompt: "What's the blast radius if I refactor the auth module?",
    color: "text-red-400",
    bgColor: "bg-red-500/8",
    borderColor: "border-red-500/20",
  },
  // Observability
  {
    id: "incident",
    label: "Incident RCA",
    icon: "🚨",
    category: "Observability",
    description: "Root cause analysis with Brain causal intelligence — trace incidents to upstream signals",
    copilotPrompt: "Diagnose our production incident and trace the root cause using Brain causal intelligence",
    color: "text-pink-400",
    bgColor: "bg-pink-500/8",
    borderColor: "border-pink-500/20",
  },
  {
    id: "log-query",
    label: "Log Query",
    icon: "📋",
    category: "Observability",
    description: "Query logs with natural language — pattern detection, error clustering, anomaly timeline",
    copilotPrompt: "Find all ERROR patterns in the last 24h logs and cluster them by root cause",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/8",
    borderColor: "border-yellow-500/20",
  },
  {
    id: "performance-profile",
    label: "Perf Profiler",
    icon: "⚡",
    category: "Observability",
    description: "APM analysis: identify slow endpoints, N+1 queries, memory leaks, SLA risk",
    copilotPrompt: "Analyze our APM data and identify the top 3 performance bottlenecks",
    color: "text-amber-400",
    bgColor: "bg-amber-500/8",
    borderColor: "border-amber-500/20",
  },
  // Data
  {
    id: "sql-analyze",
    label: "SQL Analyzer",
    icon: "🗄️",
    category: "Data",
    description: "SQL correctness, performance, N+1 detection, security (injection prevention), style",
    copilotPrompt: "Analyze this SQL query for performance issues, N+1 patterns, and security risks",
    color: "text-blue-400",
    bgColor: "bg-blue-500/8",
    borderColor: "border-blue-500/20",
  },
  {
    id: "lineage",
    label: "Data Lineage",
    icon: "🔗",
    category: "Data",
    description: "Map data flow through your system — FK relationships, circular dependency detection",
    copilotPrompt: "Map the data lineage for our user transaction table",
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/8",
    borderColor: "border-indigo-500/20",
  },
] as const;

type DomainId = (typeof DOMAIN_CATALOGUE)[number]["id"];

const DOMAIN_LABELS: Record<string, string> = Object.fromEntries(
  DOMAIN_CATALOGUE.map((d) => [d.id, d.label])
);

// ── Page ────────────────────────────────────────────────────────────────────

export default async function SeAaSDashboardPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

  // ── Workspace/Branch context ───────────────────────────────────────────
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

  // ── Recent artifacts ───────────────────────────────────────────────────
  const { data: recentArtifacts } = await supabase
    .from("se_aas_artifacts")
    .select("id, domain_type, created_at, artifact_data, metadata")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(8);

  // ── Recent jobs (pending/running) ─────────────────────────────────────
  const { data: activeJobs } = await supabase
    .from("agent_queue")
    .select("id, task_type, status, created_at")
    .eq("organization_id", orgId)
    .eq("agent_type", "se-aas")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(5);

  // ── Velocity snapshot (latest) ─────────────────────────────────────────
  const { data: latestVelocity } = await supabase
    .from("velocity_snapshots")
    .select("prs_merged, collapse_probability, model_confidence, branch_name, release_version, snapshot_date")
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

  // Group domains by category
  const grouped = DOMAIN_CATALOGUE.reduce(
    (acc, d) => {
      if (!acc[d.category]) acc[d.category] = [];
      acc[d.category].push(d);
      return acc;
    },
    {} as Record<string, (typeof DOMAIN_CATALOGUE)[number][]>
  );

  const isConnected = !!githubConnector;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Engineering Intelligence
          </h1>
          <p className="text-xs text-muted mt-0.5">
            17 Brain-augmented SE-AAS capabilities · all scoped to this workspace
          </p>
        </div>
        <Link
          href="/copilot?service=seaas"
          className="px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Open SE-AAS Copilot
        </Link>
      </div>

      {/* ── Workspace / Branch Context Badge ───────────────────────────── */}
      <div className={`rounded-xl border p-4 flex items-center gap-4 ${
        isConnected
          ? "bg-gradient-to-r from-emerald-500/5 to-cyan-500/5 border-emerald-500/20"
          : "bg-surface border-border-subtle"
      }`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${
          isConnected ? "bg-emerald-500/10" : "bg-surface"
        }`}>
          {isConnected ? "🌿" : "🔌"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">
              {isConnected ? "Workspace connected" : "No GitHub connected"}
            </span>
            {primaryBranch && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                🌿 {primaryBranch}
              </span>
            )}
            {releaseVersion && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                v{releaseVersion}
              </span>
            )}
            {githubRepo && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-muted bg-surface border border-border-subtle">
                {githubRepo}
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            {isConnected
              ? "All 17 SE-AAS capabilities are scoped to this workspace. Brain signals, causal graphs, and artifacts are fully isolated per workspace."
              : "Connect your GitHub repository to unlock velocity analysis, bottleneck detection, and branch-scoped intelligence."}
          </p>
        </div>
        {!isConnected && (
          <Link
            href="/connectors"
            className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-xs font-medium transition-colors flex-shrink-0"
          >
            Connect →
          </Link>
        )}
      </div>

      {/* ── P0 Early Warning Summary ────────────────────────────────────── */}
      {(latestVelocity || latestBottleneck) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Velocity */}
          {latestVelocity && (
            <Link href="/early-warning" className="block">
              <div className={`rounded-xl border p-4 hover:border-accent/40 transition-colors ${
                (latestVelocity.collapse_probability ?? 0) > 0.5
                  ? "bg-danger/5 border-danger/40"
                  : "bg-card border-border-subtle"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">⚡</span>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted">Velocity</span>
                  {(latestVelocity.collapse_probability ?? 0) > 0.5 && (
                    <span className="ml-auto text-[10px] bg-danger/10 text-danger px-1.5 py-0.5 rounded-full font-medium">
                      Collapse risk
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold">{latestVelocity.prs_merged ?? 0}</div>
                <div className="text-xs text-muted">PRs merged · last 7d
                  {latestVelocity.branch_name && (
                    <span className="ml-1 font-mono text-emerald-400">({latestVelocity.branch_name})</span>
                  )}
                </div>
                {latestVelocity.collapse_probability != null && (
                  <div className="mt-2 text-xs text-muted">
                    Collapse probability:{" "}
                    <span className={`font-medium ${latestVelocity.collapse_probability > 0.5 ? "text-danger" : "text-success"}`}>
                      {(latestVelocity.collapse_probability * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            </Link>
          )}

          {/* Bottleneck */}
          {latestBottleneck && (
            <Link href="/early-warning" className="block">
              <div className={`rounded-xl border p-4 hover:border-accent/40 transition-colors ${
                latestBottleneck.risk_level === "high"
                  ? "bg-warning/5 border-warning/40"
                  : "bg-card border-border-subtle"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">🎯</span>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted">Bottleneck Risk</span>
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    latestBottleneck.risk_level === "high"
                      ? "bg-danger/10 text-danger"
                      : latestBottleneck.risk_level === "medium"
                      ? "bg-warning/10 text-warning"
                      : "bg-success/10 text-success"
                  }`}>
                    {latestBottleneck.risk_level}
                  </span>
                </div>
                <div className="text-2xl font-bold">
                  {latestBottleneck.bottleneck_risk_score?.toFixed(0) ?? "—"}/100
                </div>
                <div className="text-xs text-muted">
                  HHI {latestBottleneck.reviewer_hhi?.toFixed(3) ?? "—"} ·{" "}
                  {latestBottleneck.top_reviewer
                    ? `${latestBottleneck.top_reviewer} ${((latestBottleneck.top_reviewer_share ?? 0) * 100).toFixed(0)}% reviews`
                    : "No data"}
                </div>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* ── Active Jobs ─────────────────────────────────────────────────── */}
      {activeJobs && activeJobs.length > 0 && (
        <div className="rounded-xl bg-card border border-border-subtle p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
              Active Jobs ({activeJobs.length})
            </h3>
          </div>
          <div className="space-y-2">
            {activeJobs.map((job) => (
              <div key={job.id} className="flex items-center gap-3 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  job.status === "running" ? "bg-accent animate-pulse" : "bg-muted"
                }`} />
                <span className="font-medium">{DOMAIN_LABELS[job.task_type] ?? job.task_type}</span>
                <span className="text-muted capitalize">{job.status}</span>
                <span className="text-muted ml-auto font-mono">
                  {new Date(job.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <Link href={`/se-aas/artifacts?jobId=${job.id}`} className="text-accent hover:underline">
                  track →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Domain Catalogue ────────────────────────────────────────────── */}
      {Object.entries(grouped).map(([category, domains]) => (
        <div key={category}>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {category}
            </h2>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {domains.map((domain) => {
              const isEarlyWarning = domain.id === "early-warning";
              const content = (
                <div
                  className={`rounded-xl border p-4 h-full flex flex-col gap-2 hover:border-accent/40 transition-colors cursor-pointer ${domain.bgColor} ${domain.borderColor}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{domain.icon}</span>
                    <span className="text-sm font-medium">{domain.label}</span>
                    {"badge" in domain && domain.badge && (
                      <span className="ml-auto text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full font-medium">
                        {domain.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted leading-relaxed flex-1">
                    {domain.description}
                  </p>
                  <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border-subtle/50">
                    <span className={`text-[10px] font-medium ${domain.color}`}>
                      {"copilotPrompt" in domain ? "Ask in Copilot →" : "View Dashboard →"}
                    </span>
                  </div>
                </div>
              );

              if (isEarlyWarning) {
                return (
                  <Link key={domain.id} href={domain.href} className="block">
                    {content}
                  </Link>
                );
              }

              if ("copilotPrompt" in domain) {
                return (
                  <Link
                    key={domain.id}
                    href={`/copilot?service=seaas&q=${encodeURIComponent(domain.copilotPrompt)}`}
                    className="block"
                  >
                    {content}
                  </Link>
                );
              }

              return <div key={domain.id}>{content}</div>;
            })}
          </div>
        </div>
      ))}

      {/* ── Recent Artifacts ────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border-subtle">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Recent Artifacts</h3>
            <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded">
              {recentArtifacts?.length ?? 0} recent
            </span>
          </div>
          <Link
            href="/se-aas/artifacts"
            className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
          >
            View all →
          </Link>
        </div>

        {recentArtifacts && recentArtifacts.length > 0 ? (
          <div className="divide-y divide-border-subtle">
            {recentArtifacts.map((artifact) => {
              const domainLabel = DOMAIN_LABELS[artifact.domain_type] ?? artifact.domain_type;
              const domainDef = DOMAIN_CATALOGUE.find((d) => d.id === artifact.domain_type);
              return (
                <Link
                  key={artifact.id}
                  href={`/se-aas/artifacts/${artifact.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-surface/50 transition-colors"
                >
                  <span className="text-lg flex-shrink-0">{domainDef?.icon ?? "📄"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{domainLabel}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${domainDef?.bgColor ?? ""} ${domainDef?.color ?? "text-muted"}`}>
                        {artifact.domain_type}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {new Date(artifact.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="p-8">
            <EmptyState
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              }
              title="No artifacts yet"
              description="Use any SE-AAS capability through the Copilot to generate your first artifact."
            />
          </div>
        )}
      </div>
    </div>
  );
}
