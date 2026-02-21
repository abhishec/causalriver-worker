/**
 * SE-AAS Artifact Detail Page
 * ============================
 *
 * Tabbed artifact viewer modelled on SEaaSResultPanel visual language:
 *   Summary | Findings | Actions | Metrics
 *
 * Domain-specific renderers for all 16 SE-AAS domain types.
 * Causal cascade (PR Review) shows plain BUSINESS language only —
 * no statistical terms (effect_size, HHI, confidence intervals, etc.).
 *
 * All data is server-rendered, org-scoped.
 */

import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "./copy-button";

export const dynamic = "force-dynamic";

// ── Domain metadata ───────────────────────────────────────────────────────

const DOMAIN_META: Record<string, { label: string; icon: string; colorClass: string; bgClass: string; ringClass: string }> = {
  // P0 — Delivery Intelligence
  "early-warning":        { label: "Early Warning",          icon: "⚡", colorClass: "text-red-400",     bgClass: "bg-red-500/8",     ringClass: "border-red-500/25" },
  "delivery-intelligence":{ label: "Engagement Health",      icon: "💊", colorClass: "text-emerald-400", bgClass: "bg-emerald-500/8", ringClass: "border-emerald-500/25" },
  "pod-match":            { label: "Pod Match",              icon: "🎯", colorClass: "text-cyan-400",    bgClass: "bg-cyan-500/8",    ringClass: "border-cyan-500/25" },
  "scope-creep":          { label: "Scope Creep",            icon: "📏", colorClass: "text-yellow-400",  bgClass: "bg-yellow-500/8",  ringClass: "border-yellow-500/25" },
  // P1 — Code Intelligence
  "pr-review":            { label: "PR Review",              icon: "🔍", colorClass: "text-blue-400",    bgClass: "bg-blue-500/8",    ringClass: "border-blue-500/25" },
  "tdd":                  { label: "TDD Agent",              icon: "🧪", colorClass: "text-green-400",   bgClass: "bg-green-500/8",   ringClass: "border-green-500/25" },
  "boilerplate-scaffold": { label: "Scaffolding",            icon: "🏗️", colorClass: "text-purple-400",  bgClass: "bg-purple-500/8",  ringClass: "border-purple-500/25" },
  "dependency-upgrade":   { label: "Dep Upgrade",            icon: "📦", colorClass: "text-orange-400",  bgClass: "bg-orange-500/8",  ringClass: "border-orange-500/25" },
  "design-doc-generator": { label: "HLD / LLD",              icon: "📐", colorClass: "text-cyan-400",    bgClass: "bg-cyan-500/8",    ringClass: "border-cyan-500/25" },
  "test-case-generator":  { label: "Test Cases",             icon: "✅", colorClass: "text-emerald-400", bgClass: "bg-emerald-500/8", ringClass: "border-emerald-500/25" },
  "test-data-generator":  { label: "Test Data",              icon: "🎲", colorClass: "text-teal-400",    bgClass: "bg-teal-500/8",    ringClass: "border-teal-500/25" },
  "codebase-qa":          { label: "Codebase Q&A",           icon: "💬", colorClass: "text-violet-400",  bgClass: "bg-violet-500/8",  ringClass: "border-violet-500/25" },
  "dead-code-detector":   { label: "Dead Code",              icon: "🧹", colorClass: "text-gray-400",    bgClass: "bg-gray-500/8",    ringClass: "border-gray-500/25" },
  "impact-analysis":      { label: "Impact Analysis",        icon: "💥", colorClass: "text-red-400",     bgClass: "bg-red-500/8",     ringClass: "border-red-500/25" },
  "incident-diagnosis":   { label: "Incident RCA",           icon: "🚨", colorClass: "text-pink-400",    bgClass: "bg-pink-500/8",    ringClass: "border-pink-500/25" },
  "log-query":            { label: "Log Query",              icon: "📋", colorClass: "text-yellow-400",  bgClass: "bg-yellow-500/8",  ringClass: "border-yellow-500/25" },
  "performance-profiler": { label: "Perf Profiler",          icon: "⚡", colorClass: "text-amber-400",   bgClass: "bg-amber-500/8",   ringClass: "border-amber-500/25" },
  "sql-analyzer":         { label: "SQL Analyzer",           icon: "🗄️", colorClass: "text-blue-400",    bgClass: "bg-blue-500/8",    ringClass: "border-blue-500/25" },
  "data-lineage":         { label: "Data Lineage",           icon: "🔗", colorClass: "text-indigo-400",  bgClass: "bg-indigo-500/8",  ringClass: "border-indigo-500/25" },
  "architecture-extractor":{ label: "Architecture",          icon: "🏛️", colorClass: "text-sky-400",     bgClass: "bg-sky-500/8",     ringClass: "border-sky-500/25" },
  // AAAS — Accounting Intelligence
  "aas-bookkeep":         { label: "Bookkeeper",             icon: "📒", colorClass: "text-emerald-400", bgClass: "bg-emerald-500/8", ringClass: "border-emerald-500/25" },
  "aas-reconcile":        { label: "Reconciler",             icon: "⚖️",  colorClass: "text-blue-400",    bgClass: "bg-blue-500/8",    ringClass: "border-blue-500/25" },
  "aas-statements":       { label: "Financial Statements",   icon: "📊", colorClass: "text-violet-400",  bgClass: "bg-violet-500/8",  ringClass: "border-violet-500/25" },
  "aas-tax":              { label: "Tax Compliance",          icon: "🏛️", colorClass: "text-orange-400",  bgClass: "bg-orange-500/8",  ringClass: "border-orange-500/25" },
  "aas-audit":            { label: "Audit Preparer",          icon: "🔎", colorClass: "text-pink-400",    bgClass: "bg-pink-500/8",    ringClass: "border-pink-500/25" },
  "aas-anomaly":          { label: "Anomaly Detective",       icon: "🔮", colorClass: "text-red-400",     bgClass: "bg-red-500/8",     ringClass: "border-red-500/25" },
  "aas-causal-analysis":  { label: "Causal Analysis",         icon: "🧠", colorClass: "text-indigo-400",  bgClass: "bg-indigo-500/8",  ringClass: "border-indigo-500/25" },
  "aas-full":             { label: "Full Financial Report",   icon: "📊", colorClass: "text-violet-400",  bgClass: "bg-violet-500/8",  ringClass: "border-violet-500/25" },
  "aas-financial":        { label: "Financial Analysis",      icon: "📊", colorClass: "text-violet-400",  bgClass: "bg-violet-500/8",  ringClass: "border-violet-500/25" },
  // AAAS — Slash command IDs (map to same Financial Statements renderer)
  "aas-pl":               { label: "Profit & Loss",           icon: "📊", colorClass: "text-violet-400",  bgClass: "bg-violet-500/8",  ringClass: "border-violet-500/25" },
  "aas-balance":          { label: "Balance Sheet",           icon: "⚖️",  colorClass: "text-blue-400",    bgClass: "bg-blue-500/8",    ringClass: "border-blue-500/25" },
  "aas-trial":            { label: "Trial Balance",           icon: "📋", colorClass: "text-cyan-400",    bgClass: "bg-cyan-500/8",    ringClass: "border-cyan-500/25" },
  "aas-gst":              { label: "GST F5 Review",           icon: "🏛️", colorClass: "text-orange-400",  bgClass: "bg-orange-500/8",  ringClass: "border-orange-500/25" },
  "aas-transactions":     { label: "Transactions",            icon: "💳", colorClass: "text-teal-400",    bgClass: "bg-teal-500/8",    ringClass: "border-teal-500/25" },
  "aas-benchmark":        { label: "SaaS Benchmark",          icon: "📐", colorClass: "text-amber-400",   bgClass: "bg-amber-500/8",   ringClass: "border-amber-500/25" },
};

// ── Severity helper ───────────────────────────────────────────────────────

function severityBadge(severity: string) {
  const s = (severity ?? "info").toLowerCase();
  const map: Record<string, string> = {
    critical: "bg-danger/10 text-danger border border-danger/30",
    high:     "bg-warning/10 text-warning border border-warning/30",
    medium:   "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30",
    low:      "bg-blue-500/10 text-blue-400 border border-blue-500/30",
    info:     "bg-surface text-muted border border-border-subtle",
    warning:  "bg-warning/10 text-warning border border-warning/30",
    error:    "bg-danger/10 text-danger border border-danger/30",
  };
  const cls = map[s] ?? map.info;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        ["critical","error"].includes(s) ? "bg-danger" :
        ["high","warning"].includes(s) ? "bg-warning" :
        s === "medium" ? "bg-yellow-400" :
        s === "low" ? "bg-blue-400" : "bg-muted"
      }`} />
      {s.toUpperCase()}
    </span>
  );
}

// ── Causal cascade: business language only ────────────────────────────────

/**
 * Maps raw causal cascade data → plain business sentences.
 * NO statistical terms. Effect sizes become business language.
 * Lag days become human time phrases. Confidence is hidden entirely.
 */
function formatCausalImpact(c: Record<string, any>): { headline: string; detail: string; urgency: "critical" | "high" | "medium" | "low" } {
  const domain = (c.domain ?? "").toLowerCase();
  const lag = c.lagDays ?? 30;
  const effect = Math.abs(c.effectSize ?? 0.3);
  const isNegative = (c.effectSize ?? 0) < 0;

  // Human time label
  const timeLabel =
    lag <= 7  ? "within a week" :
    lag <= 14 ? "within two weeks" :
    lag <= 30 ? "within a month" :
    lag <= 60 ? "within ~2 months" :
    lag <= 90 ? "within a quarter" : "over the next few months";

  // Strength label
  const strength =
    effect >= 0.6 ? "strong" :
    effect >= 0.4 ? "meaningful" :
    effect >= 0.2 ? "moderate" : "some";

  // Business headline by domain
  const domainPhrases: Record<string, { good: string; bad: string }> = {
    customer_success: {
      bad:  `Customer satisfaction is likely to drop ${timeLabel}`,
      good: `Customer satisfaction is likely to improve ${timeLabel}`,
    },
    revenue: {
      bad:  `Revenue or renewal rates may decline ${timeLabel}`,
      good: `Revenue performance may improve ${timeLabel}`,
    },
    churn: {
      bad:  `Customer churn risk increases ${timeLabel}`,
      good: `Customer retention improves ${timeLabel}`,
    },
    nps: {
      bad:  `Net Promoter Score (NPS) may decrease ${timeLabel}`,
      good: `NPS is likely to rise ${timeLabel}`,
    },
    support: {
      bad:  `Support ticket volume may increase ${timeLabel}`,
      good: `Support load is likely to reduce ${timeLabel}`,
    },
    sales: {
      bad:  `Sales pipeline health may be impacted ${timeLabel}`,
      good: `Sales momentum may improve ${timeLabel}`,
    },
    operations: {
      bad:  `Operational costs or incidents may increase ${timeLabel}`,
      good: `Operational efficiency is likely to improve ${timeLabel}`,
    },
    product: {
      bad:  `Product adoption may slow down ${timeLabel}`,
      good: `Product adoption is likely to accelerate ${timeLabel}`,
    },
  };

  const matchKey = Object.keys(domainPhrases).find((k) => domain.includes(k)) ?? null;
  const headline = matchKey
    ? (isNegative ? domainPhrases[matchKey].bad : domainPhrases[matchKey].good)
    : (c.relationship ?? `Downstream impact on ${c.domain} expected ${timeLabel}`);

  const detail = `Brain has observed a ${strength} pattern where engineering changes like this tend to ${isNegative ? "negatively affect" : "positively affect"} ${c.domain.replace(/_/g, " ")} ${timeLabel}. Consider proactive communication with relevant teams.`;

  const urgency =
    (c.severity ?? "low") === "critical" || (c.severity ?? "") === "high"
      ? (c.severity as "critical" | "high")
      : effect >= 0.5 ? "high" : effect >= 0.3 ? "medium" : "low";

  return { headline, detail, urgency };
}

// ── Sub-renderers for each domain ─────────────────────────────────────────

// PR Review
function PRReviewRenderer({ data }: { data: Record<string, any> }) {
  const causal = (data.causalCascade as Array<Record<string, any>> | undefined) ?? [];
  const comments = (data.comments as Array<Record<string, any>> | undefined) ?? [];
  const recommendations = (data.recommendations as string[] | undefined) ?? [];

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          value={data.overallScore ?? "—"}
          label="Overall Score"
          accent={data.overallScore >= 70}
        />
        <StatTile
          value={data.approved ? "Approved ✅" : "Changes ❌"}
          label="Review Decision"
          danger={!data.approved}
        />
        <StatTile
          value={String(data.riskLevel ?? "—").charAt(0).toUpperCase() + String(data.riskLevel ?? "").slice(1)}
          label="Risk Level"
          danger={["high", "critical"].includes((data.riskLevel ?? "").toLowerCase())}
        />
        <StatTile value={comments.length} label="Comments" />
      </div>

      {/* Summary */}
      {data.summary && (
        <SectionCard title="Review Summary">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </SectionCard>
      )}

      {/* Brain Business Impact — NO statistical terms */}
      {causal.length > 0 && (
        <div className="rounded-xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🧠</span>
            <span className="text-sm font-semibold">Business Impact Forecast</span>
            <Badge variant="accent" size="xs" className="ml-auto">Brain Intelligence</Badge>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Based on Brain&apos;s analysis of your workspace&apos;s historical patterns,
            merging this PR is likely to have the following downstream business effects:
          </p>
          <div className="space-y-2">
            {causal.map((c, i) => {
              const { headline, detail, urgency } = formatCausalImpact(c);
              const urgencyConfig: Record<string, string> = {
                critical: "border-danger/30 bg-danger/5",
                high:     "border-warning/30 bg-warning/5",
                medium:   "border-yellow-500/20 bg-yellow-500/5",
                low:      "border-border-subtle bg-surface/40",
              };
              const badgeVariant: Record<string, "danger" | "warning" | "info" | "default"> = {
                critical: "danger",
                high:     "warning",
                medium:   "info",
                low:      "default",
              };
              return (
                <div key={i} className={`rounded-lg border p-3 ${urgencyConfig[urgency] ?? urgencyConfig.low}`}>
                  <div className="flex items-start gap-2.5">
                    <Badge variant={badgeVariant[urgency] ?? "default"} size="xs" className="mt-0.5 shrink-0">
                      {urgency}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{headline}</p>
                      <p className="text-xs text-muted mt-1 leading-relaxed">{detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Code comments */}
      {comments.length > 0 && (
        <SectionCard title={`Code Review Comments (${comments.length})`} padding={false}>
          <div className="divide-y divide-border-subtle">
            {comments.map((c, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {severityBadge(c.severity ?? "info")}
                  {c.category && (
                    <Badge variant="default" size="xs" className="font-mono">{c.category}</Badge>
                  )}
                  {(c.file || c.line) && (
                    <span className="text-[10px] text-muted ml-auto font-mono">
                      {c.file}{c.line ? `:${c.line}` : ""}
                    </span>
                  )}
                </div>
                <p className="text-sm">{c.message}</p>
                {c.suggestion && (
                  <p className="text-xs text-accent mt-1.5">
                    <span className="font-medium">Suggestion:</span> {c.suggestion}
                  </p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <SectionCard title="Recommended Actions">
          <ol className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">{r}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}
    </div>
  );
}

// TDD Agent
function TDDRenderer({ data }: { data: Record<string, any> }) {
  const tests = (data.tests as Array<Record<string, any>> | undefined) ?? [];
  const coverage = data.estimatedCoverage ?? data.coverageEstimate ?? null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile value={tests.length} label="Tests Generated" accent />
        <StatTile value={coverage != null ? `${coverage}%` : "—"} label="Coverage Estimate" accent={coverage >= 80} />
        <StatTile value={data.framework ?? data.testFramework ?? "Jest"} label="Framework" />
      </div>
      {data.summary && (
        <SectionCard title="Summary">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </SectionCard>
      )}
      {tests.length > 0 && (
        <SectionCard title="Generated Tests" padding={false}>
          <div className="divide-y divide-border-subtle">
            {tests.map((t, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold">{t.name ?? t.title ?? `Test ${i + 1}`}</span>
                  {t.type && <Badge variant="default" size="xs">{t.type}</Badge>}
                  {t.priority && <Badge variant={t.priority === "high" ? "danger" : "default"} size="xs">{t.priority}</Badge>}
                </div>
                {t.description && <p className="text-xs text-muted mb-2">{t.description}</p>}
                {t.code && (
                  <pre className="text-xs bg-surface border border-border-subtle rounded-lg p-3 overflow-x-auto leading-relaxed">
                    {t.code}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// Design Doc (HLD / LLD)
function DesignDocRenderer({ data }: { data: Record<string, any> }) {
  const openDecisions = (data.openDecisions as Array<Record<string, any>> | undefined) ?? [];
  const patterns = (data.patterns as string[] | undefined) ?? [];

  // Build full Confluence-ready markdown for copy action
  const confluenceContent = [
    data.hld?.fullMarkdown ? `## High-Level Design\n\n${data.hld.fullMarkdown}` : null,
    data.lld?.fullMarkdown ? `## Low-Level Design\n\n${data.lld.fullMarkdown}` : null,
    openDecisions.length > 0
      ? `## Open Decisions\n\n${openDecisions.map((d: any) => `- **${d.question}**${d.recommendation ? `\n  Recommendation: ${d.recommendation}` : ""}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile value={`${data.qualityScore ?? "—"}/100`} label="Quality Score" accent={data.qualityScore >= 70} />
        <StatTile value={openDecisions.length} label="Open Decisions" danger={openDecisions.length > 3} />
        <StatTile value={patterns.length} label="Patterns Detected" />
      </div>

      {/* ── Confluence Export Action (P1-07 spec) ──────────────────────── */}
      <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base">📝</span>
            <div>
              <div className="text-sm font-semibold">Confluence-Ready Export</div>
              <div className="text-xs text-muted">
                Copy this design doc as Markdown and paste into a Confluence page.
                Maintenance mode: when code changes are merged, Brain will flag deviations from this approved design.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {data.jiraTicketUrl && (
              <a
                href={data.jiraTicketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface text-xs font-medium hover:bg-surface-hover transition-colors"
              >
                <span>🔗</span>
                Linked Jira Ticket
              </a>
            )}
            {confluenceContent && (
              <CopyButton text={confluenceContent} label="Copy Markdown" />
            )}
          </div>
        </div>
        {data.confluenceAutoSaved && (
          <div className="mt-3 flex items-center gap-2 text-xs text-success">
            <span>✓</span>
            <span>Auto-saved to Confluence page: <span className="font-mono">{data.confluencePageTitle ?? "Design Document"}</span></span>
          </div>
        )}
        {data.deviationsDetected && (
          <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-warning/10 border border-warning/20 text-xs text-warning">
            <span className="shrink-0">⚠️</span>
            <span>Implementation deviates from approved design in {data.deviationsDetected} area(s). Review required before next merge.</span>
          </div>
        )}
      </div>

      {data.hld?.fullMarkdown && (
        <SectionCard title="High-Level Design (HLD)">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed overflow-auto max-h-80">
            {data.hld.fullMarkdown}
          </pre>
        </SectionCard>
      )}
      {data.lld?.fullMarkdown && (
        <SectionCard title="Low-Level Design (LLD)">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed overflow-auto max-h-80">
            {data.lld.fullMarkdown}
          </pre>
        </SectionCard>
      )}
      {openDecisions.length > 0 && (
        <SectionCard title="Open Architectural Decisions" padding={false}>
          <div className="divide-y divide-border-subtle">
            {openDecisions.map((d, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{d.question}</span>
                  {d.impact && (
                    <Badge variant={d.impact === "high" ? "danger" : "default"} size="xs" className="ml-auto">
                      {d.impact} impact
                    </Badge>
                  )}
                </div>
                {d.recommendation && (
                  <p className="text-xs text-accent mt-1">Recommendation: {d.recommendation}</p>
                )}
                {d.options && d.options.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {d.options.map((o: string, j: number) => (
                      <Badge key={j} variant="default" size="xs">{o}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// Dependency Upgrade
function DepUpgradeRenderer({ data }: { data: Record<string, any> }) {
  const securityIssues = (data.securityIssues as Array<Record<string, any>> | undefined) ?? [];
  const outdated = (data.outdated as Array<Record<string, any>> | undefined) ?? [];
  const migrationSteps = (data.migrationSteps as Array<Record<string, any>> | undefined) ?? [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile value={`${data.upgradeRiskScore ?? "—"}/100`} label="Risk Score" danger={(data.upgradeRiskScore ?? 0) > 60} />
        <StatTile value={outdated.length} label="Outdated Packages" />
        <StatTile value={securityIssues.length} label="Security Issues" danger={securityIssues.length > 0} />
        <StatTile value={data.breakingChanges?.length ?? 0} label="Breaking Changes" danger={(data.breakingChanges?.length ?? 0) > 0} />
      </div>
      {securityIssues.length > 0 && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🔐</span>
            <span className="text-sm font-semibold text-danger">Security Issues</span>
          </div>
          <div className="space-y-2">
            {securityIssues.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5">
                {severityBadge(s.severity ?? "high")}
                <div>
                  <span className="text-sm font-medium">{s.dependency}</span>
                  {s.fixedInVersion && (
                    <span className="text-xs text-muted ml-1">→ upgrade to {s.fixedInVersion}</span>
                  )}
                  {s.cve && <Badge variant="danger" size="xs" className="ml-1 font-mono">{s.cve}</Badge>}
                  {s.description && <p className="text-xs text-muted mt-0.5">{s.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {migrationSteps.length > 0 && (
        <SectionCard title="Migration Plan" padding={false}>
          <div className="divide-y divide-border-subtle">
            {migrationSteps.map((s, i) => (
              <div key={i} className="px-4 py-3">
                <div className="text-xs text-muted mb-1">Step {s.order ?? i + 1} · {s.dependency}</div>
                <p className="text-sm">{s.action}</p>
                {s.code && (
                  <pre className="text-xs bg-surface border border-border-subtle rounded-lg p-3 mt-2 overflow-x-auto">
                    {s.code}
                  </pre>
                )}
                {s.testCommand && (
                  <p className="text-xs text-muted mt-1.5">
                    Verify: <code className="font-mono text-accent">{s.testCommand}</code>
                  </p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// Incident RCA
function IncidentRCARenderer({ data }: { data: Record<string, any> }) {
  const timeline = (data.timeline as Array<Record<string, any>> | undefined) ?? [];
  const rootCauses = (data.rootCauses as Array<Record<string, any>> | undefined)
    ?? (data.rootCause ? [{ description: data.rootCause }] : []);
  const mitigations = (data.mitigations as string[] | undefined)
    ?? (data.recommendations as string[] | undefined) ?? [];
  return (
    <div className="space-y-5">
      {data.severity && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Incident Severity:</span>
          {severityBadge(data.severity)}
        </div>
      )}
      {data.summary && (
        <SectionCard title="What Happened">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </SectionCard>
      )}
      {rootCauses.length > 0 && (
        <SectionCard title="Root Cause" padding={false}>
          <div className="divide-y divide-border-subtle">
            {rootCauses.map((rc, i) => (
              <div key={i} className="px-4 py-3">
                <p className="text-sm">{rc.description ?? rc.cause ?? rc}</p>
                {rc.component && <Badge variant="default" size="xs" className="mt-1">{rc.component}</Badge>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {timeline.length > 0 && (
        <SectionCard title="Incident Timeline">
          <div className="relative pl-5 space-y-4">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-border-subtle" />
            {timeline.map((e, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-3 top-1.5 w-2 h-2 rounded-full border-2 border-border bg-card" />
                <div className="text-[10px] text-muted font-mono mb-0.5">{e.time ?? e.timestamp}</div>
                <p className="text-xs">{e.event ?? e.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {mitigations.length > 0 && (
        <SectionCard title="Preventive Actions">
          <ol className="space-y-2">
            {mitigations.map((m, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">{m}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}
    </div>
  );
}

// Impact Analysis
function ImpactAnalysisRenderer({ data }: { data: Record<string, any> }) {
  const affectedModules = (data.affectedModules as Array<Record<string, any>> | undefined) ?? [];
  const breakingChanges = (data.breakingChanges as string[] | undefined) ?? [];
  const recommendations = (data.recommendations as string[] | undefined) ?? [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile value={affectedModules.length} label="Affected Modules" danger={affectedModules.length > 5} />
        <StatTile value={breakingChanges.length} label="Breaking Changes" danger={breakingChanges.length > 0} />
        <StatTile
          value={String(data.riskLevel ?? "—").charAt(0).toUpperCase() + String(data.riskLevel ?? "").slice(1)}
          label="Risk Level"
          danger={["high","critical"].includes((data.riskLevel ?? "").toLowerCase())}
        />
      </div>
      {data.summary && (
        <SectionCard title="Blast Radius Summary">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </SectionCard>
      )}
      {affectedModules.length > 0 && (
        <SectionCard title="Affected Modules" padding={false}>
          <div className="divide-y divide-border-subtle">
            {affectedModules.map((m, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1">
                  <span className="text-sm font-medium font-mono">{m.name ?? m.module ?? m.path}</span>
                  {m.reason && <p className="text-xs text-muted mt-0.5">{m.reason}</p>}
                </div>
                {m.impact && severityBadge(m.impact)}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {breakingChanges.length > 0 && (
        <div className="rounded-xl border border-danger/25 bg-danger/5 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-danger mb-2">Breaking Changes</p>
          <ul className="space-y-1.5">
            {breakingChanges.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-danger mt-0.5 shrink-0">✕</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {recommendations.length > 0 && (
        <SectionCard title="Recommended Actions">
          <ol className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">{r}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}
    </div>
  );
}

// SQL Analyzer
function SQLAnalyzerRenderer({ data }: { data: Record<string, any> }) {
  const issues = (data.issues as Array<Record<string, any>> | undefined) ?? [];
  const optimizations = (data.optimizations as string[] | undefined)
    ?? (data.recommendations as string[] | undefined) ?? [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile value={`${data.score ?? data.qualityScore ?? "—"}/100`} label="Query Quality" accent={(data.score ?? 0) >= 70} />
        <StatTile value={issues.length} label="Issues Found" danger={issues.some((i) => ["critical","high"].includes(i.severity?.toLowerCase()))} />
        <StatTile value={data.estimatedCostReduction ?? data.performanceGain ?? "—"} label="Potential Gain" />
      </div>
      {data.summary && (
        <SectionCard title="Analysis Summary">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </SectionCard>
      )}
      {issues.length > 0 && (
        <SectionCard title="Query Issues" padding={false}>
          <div className="divide-y divide-border-subtle">
            {issues.map((iss, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  {severityBadge(iss.severity ?? "info")}
                  {iss.category && <Badge variant="default" size="xs">{iss.category}</Badge>}
                </div>
                <p className="text-sm">{iss.description ?? iss.message}</p>
                {iss.fix && (
                  <p className="text-xs text-accent mt-1">Fix: {iss.fix}</p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {optimizations.length > 0 && (
        <SectionCard title="Optimisations">
          <ol className="space-y-2">
            {optimizations.map((o, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">{o}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}
    </div>
  );
}

// Performance Profiler
function PerfProfilerRenderer({ data }: { data: Record<string, any> }) {
  const bottlenecks = (data.bottlenecks as Array<Record<string, any>> | undefined) ?? [];
  const recommendations = (data.recommendations as string[] | undefined) ?? [];
  return (
    <div className="space-y-5">
      {data.summary && (
        <SectionCard title="Performance Overview">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </SectionCard>
      )}
      {bottlenecks.length > 0 && (
        <SectionCard title={`Top Bottlenecks (${bottlenecks.length})`} padding={false}>
          <div className="divide-y divide-border-subtle">
            {bottlenecks.map((b, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium font-mono">{b.endpoint ?? b.function ?? b.component ?? b.name}</span>
                  {b.severity && severityBadge(b.severity)}
                </div>
                <p className="text-xs text-muted">{b.description ?? b.issue}</p>
                {b.p99Latency && (
                  <p className="text-xs text-warning mt-0.5">Slow at peak: {b.p99Latency}</p>
                )}
                {b.fix && (
                  <p className="text-xs text-accent mt-1">Recommendation: {b.fix}</p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {recommendations.length > 0 && (
        <SectionCard title="Performance Actions">
          <ol className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">{r}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}
    </div>
  );
}

// Log Query
function LogQueryRenderer({ data }: { data: Record<string, any> }) {
  const patterns = (data.patterns as Array<Record<string, any>> | undefined) ?? [];
  const anomalies = (data.anomalies as Array<Record<string, any>> | undefined) ?? [];
  return (
    <div className="space-y-5">
      {data.answer && (
        <SectionCard title="Answer">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.answer}</p>
        </SectionCard>
      )}
      {patterns.length > 0 && (
        <SectionCard title="Error Patterns" padding={false}>
          <div className="divide-y divide-border-subtle">
            {patterns.map((p, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{p.pattern ?? p.type ?? p.name}</span>
                  {p.count && <Badge variant="default" size="xs">{p.count}×</Badge>}
                  {p.severity && severityBadge(p.severity)}
                </div>
                {p.description && <p className="text-xs text-muted">{p.description}</p>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {anomalies.length > 0 && (
        <SectionCard title="Anomalies Detected" padding={false}>
          <div className="divide-y divide-border-subtle">
            {anomalies.map((a, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{a.description ?? a.type}</span>
                  {a.severity && severityBadge(a.severity)}
                </div>
                {a.timestamp && <p className="text-[10px] text-muted font-mono">{a.timestamp}</p>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// Dead Code Detector
function DeadCodeRenderer({ data }: { data: Record<string, any> }) {
  const deadItems = (data.deadItems as Array<Record<string, any>> | undefined)
    ?? (data.items as Array<Record<string, any>> | undefined) ?? [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile value={deadItems.length} label="Dead Code Items" danger={deadItems.length > 20} />
        <StatTile value={data.estimatedSavings ?? data.bundleSavings ?? "—"} label="Bundle Savings" accent />
        <StatTile value={data.safeToRemove ?? "—"} label="Safe to Remove" />
      </div>
      {data.summary && (
        <SectionCard title="Summary">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </SectionCard>
      )}
      {deadItems.length > 0 && (
        <SectionCard title="Dead Code Found" padding={false}>
          <div className="divide-y divide-border-subtle">
            {deadItems.slice(0, 30).map((item, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono text-muted-foreground">
                    {item.file ?? item.path ?? item.name}
                    {item.line ? `:${item.line}` : ""}
                  </span>
                  {item.type && <Badge variant="default" size="xs" className="ml-2">{item.type}</Badge>}
                </div>
                {item.confidence != null && (
                  <span className="text-[10px] text-success shrink-0">
                    {(item.confidence * 100).toFixed(0)}% safe
                  </span>
                )}
              </div>
            ))}
            {deadItems.length > 30 && (
              <div className="px-4 py-2 text-xs text-muted">
                + {deadItems.length - 30} more items
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// Codebase Q&A
function CodebaseQARenderer({ data }: { data: Record<string, any> }) {
  const sources = (data.sources as Array<Record<string, any>> | undefined) ?? [];
  return (
    <div className="space-y-5">
      {(data.answer || data.narrative) && (
        <SectionCard title="Answer">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {data.answer ?? data.narrative}
          </p>
        </SectionCard>
      )}
      {sources.length > 0 && (
        <SectionCard title="Sources Consulted" padding={false}>
          <div className="divide-y divide-border-subtle">
            {sources.map((s, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground flex-1">
                  {s.file ?? s.path ?? s.name}
                  {s.line ? `:${s.line}` : ""}
                </span>
                {s.relevance && (
                  <span className="text-[10px] text-muted shrink-0">
                    {Math.round((s.relevance ?? 0) * 100)}% match
                  </span>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// Architecture Extractor
function ArchitectureRenderer({ data }: { data: Record<string, any> }) {
  const services = (data.services as Array<Record<string, any>> | undefined) ?? [];
  const dataFlows = (data.dataFlows as Array<Record<string, any>> | undefined) ?? [];
  const riskAreas = (data.riskAreas as Array<Record<string, any>> | undefined) ?? [];
  const techStack = (data.techStack as Array<Record<string, any>> | undefined) ?? [];
  const externalIntegrations = (data.externalIntegrations as Array<Record<string, any>> | undefined) ?? [];
  const insights = (data.architectureInsights as string[] | undefined) ?? [];
  const weeklyDiff = (data.weeklyDiff as Record<string, any> | undefined) ?? null;
  const lastExtractedAt = data.extractedAt ?? data.generatedAt ?? null;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile value={services.length} label="Services" accent={services.length > 0} />
        <StatTile value={dataFlows.length} label="Data Flows" />
        <StatTile value={riskAreas.filter((r: any) => r.severity === "high").length} label="High Risks" danger={riskAreas.filter((r: any) => r.severity === "high").length > 0} />
        <StatTile value={techStack.length} label="Tech Stack" />
      </div>

      {/* ── Architecture Auto-Sync Status (P1-15 spec) ──────────────────── */}
      <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🔄</span>
            <div>
              <div className="text-sm font-semibold">Architecture Auto-Sync</div>
              <div className="text-xs text-muted">
                Diagrams auto-update when code changes are merged to your primary branch.
                A weekly diff report shows what changed in the architecture since last extraction.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {lastExtractedAt && (
              <span className="text-[10px] text-muted bg-surface border border-border-subtle rounded px-2 py-1">
                Last extracted {new Date(lastExtractedAt).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                })}
              </span>
            )}
            <Badge variant="accent" size="xs" pulse>Auto-sync On</Badge>
          </div>
        </div>

        {/* Weekly Architecture Diff */}
        {weeklyDiff ? (
          <div className="mt-3 space-y-2">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider">
              Weekly Architecture Changes
            </div>
            <div className="grid grid-cols-3 gap-2">
              {weeklyDiff.newServices?.length > 0 && (
                <div className="p-2 rounded-lg bg-success/10 border border-success/20">
                  <div className="text-xs font-semibold text-success">+{weeklyDiff.newServices.length} New</div>
                  <div className="text-[10px] text-muted">{(weeklyDiff.newServices as string[]).slice(0, 2).join(", ")}</div>
                </div>
              )}
              {weeklyDiff.removedServices?.length > 0 && (
                <div className="p-2 rounded-lg bg-danger/10 border border-danger/20">
                  <div className="text-xs font-semibold text-danger">−{weeklyDiff.removedServices.length} Removed</div>
                  <div className="text-[10px] text-muted">{(weeklyDiff.removedServices as string[]).slice(0, 2).join(", ")}</div>
                </div>
              )}
              {weeklyDiff.changedConnections?.length > 0 && (
                <div className="p-2 rounded-lg bg-warning/10 border border-warning/20">
                  <div className="text-xs font-semibold text-warning">~{weeklyDiff.changedConnections.length} Changed</div>
                  <div className="text-[10px] text-muted">data flow connections</div>
                </div>
              )}
            </div>
            {weeklyDiff.summary && (
              <p className="text-xs text-muted mt-1">{weeklyDiff.summary}</p>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-muted mt-2">
            Weekly diff will appear here after the second extraction. GitHub webhook push events trigger automatic re-extraction.
          </p>
        )}
      </div>

      {/* Summary */}
      {data.summary && (
        <SectionCard title="Architecture Summary">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </SectionCard>
      )}

      {/* Mermaid Service Graph */}
      {data.mermaidServiceGraph && (
        <SectionCard title="Service Dependency Graph">
          <pre className="text-xs font-mono bg-surface rounded-lg p-4 overflow-x-auto text-muted leading-relaxed border border-border-subtle whitespace-pre-wrap">
            {data.mermaidServiceGraph}
          </pre>
          <p className="text-[10px] text-muted mt-2">Copy the above into <a href="https://mermaid.live" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">mermaid.live</a> to render the interactive diagram.</p>
        </SectionCard>
      )}

      {/* Mermaid Data Flow Diagram */}
      {data.mermaidDataFlow && (
        <SectionCard title="Data Flow Diagram">
          <pre className="text-xs font-mono bg-surface rounded-lg p-4 overflow-x-auto text-muted leading-relaxed border border-border-subtle whitespace-pre-wrap">
            {data.mermaidDataFlow}
          </pre>
        </SectionCard>
      )}

      {/* Services */}
      {services.length > 0 && (
        <SectionCard title={`Services (${services.length})`}>
          <div className="space-y-2">
            {services.map((svc: any, i: number) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-border-subtle last:border-0">
                <span className="text-base mt-0.5">
                  {svc.type === "api" ? "🔌" : svc.type === "database" ? "🗄️" : svc.type === "queue" ? "📨" : svc.type === "frontend" ? "🖥️" : svc.type === "worker" ? "⚙️" : svc.type === "gateway" ? "🚪" : "📦"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{svc.name}</span>
                    <Badge variant="default" size="xs">{svc.type}</Badge>
                    {svc.language && <Badge variant="accent" size="xs">{svc.language}</Badge>}
                    {svc.ownerTeam && <Badge variant="info" size="xs">{svc.ownerTeam}</Badge>}
                  </div>
                  {svc.description && <p className="text-xs text-muted mt-0.5 line-clamp-2">{svc.description}</p>}
                  {svc.dependencies?.length > 0 && (
                    <p className="text-[10px] text-muted mt-1">Depends on: {(svc.dependencies as string[]).join(", ")}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Risk Areas */}
      {riskAreas.length > 0 && (
        <SectionCard title="Architecture Risks">
          <div className="space-y-2">
            {riskAreas.map((risk: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border-subtle bg-surface/50">
                <div className="mt-0.5 shrink-0">{severityBadge(risk.severity)}</div>
                <div>
                  <div className="text-xs font-medium">{risk.area}</div>
                  <div className="text-xs text-muted mt-0.5">{risk.risk}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Tech Stack */}
      {techStack.length > 0 && (
        <SectionCard title="Tech Stack">
          <div className="flex flex-wrap gap-2">
            {techStack.map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border-subtle">
                <span className="text-xs font-medium">{t.name}</span>
                {t.version && <span className="text-[10px] text-muted">v{t.version}</span>}
                {t.purpose && <span className="text-[10px] text-muted">· {t.purpose}</span>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* External Integrations */}
      {externalIntegrations.length > 0 && (
        <SectionCard title="External Integrations">
          <div className="space-y-1.5">
            {externalIntegrations.map((ext: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-border-subtle last:border-0">
                <span className="font-medium">{ext.name}</span>
                <Badge variant="default" size="xs">{ext.type}</Badge>
                {ext.description && <span className="text-muted">{ext.description}</span>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Architecture Insights */}
      {insights.length > 0 && (
        <SectionCard title="Architecture Insights">
          <ul className="space-y-1.5">
            {insights.map((ins: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted">
                <span className="text-accent mt-0.5 shrink-0">→</span>
                <span>{ins}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

// Scaffolding / Boilerplate Generator
function ScaffoldingRenderer({ data }: { data: Record<string, any> }) {
  const files = (data.files as Array<Record<string, any>> | undefined) ?? [];
  const structure = (data.structure as string[] | undefined) ?? [];
  const commands = (data.setupCommands as string[] | undefined) ?? [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile value={files.length || structure.length} label="Files Generated" accent={files.length > 0} />
        <StatTile value={data.type ?? data.serviceType ?? "—"} label="Service Type" />
        <StatTile value={data.language ?? "—"} label="Language" />
      </div>

      {data.summary && (
        <SectionCard title="Overview">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </SectionCard>
      )}

      {/* File Tree */}
      {structure.length > 0 && (
        <SectionCard title="File Structure">
          <pre className="text-xs font-mono text-muted bg-surface rounded-lg p-4 border border-border-subtle leading-relaxed overflow-x-auto">
            {structure.join("\n")}
          </pre>
        </SectionCard>
      )}

      {/* Generated Files */}
      {files.length > 0 && (
        <SectionCard title={`Generated Files (${files.length})`}>
          <div className="space-y-3">
            {files.slice(0, 8).map((file: any, i: number) => (
              <div key={i} className="rounded-lg border border-border-subtle overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border-subtle">
                  <span className="text-[10px] font-mono text-accent">{file.path ?? file.name}</span>
                  {file.language && <Badge variant="default" size="xs">{file.language}</Badge>}
                </div>
                {file.content && (
                  <pre className="text-[11px] font-mono text-muted p-3 overflow-x-auto leading-relaxed max-h-48">
                    {String(file.content).slice(0, 800)}{String(file.content).length > 800 ? "\n..." : ""}
                  </pre>
                )}
              </div>
            ))}
            {files.length > 8 && (
              <p className="text-xs text-muted">+ {files.length - 8} more files in the artifact</p>
            )}
          </div>
        </SectionCard>
      )}

      {/* Setup commands */}
      {commands.length > 0 && (
        <SectionCard title="Setup Commands">
          <div className="space-y-1.5">
            {commands.map((cmd: string, i: number) => (
              <pre key={i} className="text-xs font-mono bg-surface rounded px-3 py-2 border border-border-subtle text-muted">{cmd}</pre>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// Data Lineage Mapper
function DataLineageRenderer({ data }: { data: Record<string, any> }) {
  const entities = (data.entities as Array<Record<string, any>> | undefined) ?? [];
  const relationships = (data.relationships as Array<Record<string, any>> | undefined) ?? [];
  const lineagePaths = (data.lineagePaths as Array<Record<string, any>> | undefined) ?? [];
  const orphanTables = (data.orphanTables as string[] | undefined) ?? [];
  const circular = (data.circularDependencies as string[][] | undefined) ?? [];
  const risks = (data.dataQualityRisks as Array<Record<string, any>> | undefined) ?? [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile value={entities.length} label="Tables / Entities" accent={entities.length > 0} />
        <StatTile value={relationships.length} label="Relationships" />
        <StatTile value={orphanTables.length} label="Orphan Tables" danger={orphanTables.length > 0} />
        <StatTile value={circular.length} label="Circular Deps" danger={circular.length > 0} />
      </div>

      {data.summary && (
        <SectionCard title="Lineage Summary">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </SectionCard>
      )}

      {/* Lineage Paths — the key output */}
      {lineagePaths.length > 0 && (
        <SectionCard title="Data Lineage Paths">
          <div className="space-y-2">
            {lineagePaths.map((path: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 flex-wrap py-1.5 border-b border-border-subtle last:border-0">
                {(path.path as string[] ?? [path.from, path.to]).map((step: string, j: number) => (
                  <span key={j} className="flex items-center gap-1.5">
                    {j > 0 && <span className="text-muted text-xs">→</span>}
                    <span className="text-xs font-mono bg-surface border border-border-subtle rounded px-2 py-0.5">{step}</span>
                  </span>
                ))}
                {path.transformations?.length > 0 && (
                  <Badge variant="info" size="xs" className="ml-2">{path.transformations.length} transforms</Badge>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Entities */}
      {entities.length > 0 && (
        <SectionCard title={`Entities (${entities.length})`}>
          <div className="flex flex-wrap gap-2">
            {entities.map((e: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border-subtle">
                <span className="text-xs font-mono font-medium">{e.name}</span>
                {e.isJunctionTable && <Badge variant="default" size="xs">junction</Badge>}
                {e.primaryKey?.length > 0 && <span className="text-[10px] text-muted">PK: {e.primaryKey.join(", ")}</span>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Orphan Tables + Circular Deps */}
      {(orphanTables.length > 0 || circular.length > 0) && (
        <SectionCard title="Issues Detected">
          {orphanTables.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-semibold text-warning uppercase tracking-wider mb-2">Orphan Tables (no relationships)</div>
              <div className="flex flex-wrap gap-1.5">
                {orphanTables.map((t: string, i: number) => (
                  <Badge key={i} variant="warning" size="xs">{t}</Badge>
                ))}
              </div>
            </div>
          )}
          {circular.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-danger uppercase tracking-wider mb-2">Circular Dependencies</div>
              {circular.map((cycle: string[], i: number) => (
                <div key={i} className="text-xs font-mono text-danger flex items-center gap-1 flex-wrap mb-1">
                  {cycle.map((t, j) => (
                    <span key={j} className="flex items-center gap-1">{j > 0 && <span>→</span>}{t}</span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Data Quality Risks */}
      {risks.length > 0 && (
        <SectionCard title="Data Quality Risks">
          <div className="space-y-2">
            {risks.map((r: any, i: number) => (
              <div key={i} className="flex items-start gap-2 py-1.5 border-b border-border-subtle last:border-0">
                {severityBadge(r.severity ?? "medium")}
                <div>
                  <div className="text-xs font-medium">{r.table ?? r.field}</div>
                  <div className="text-xs text-muted">{r.description ?? r.risk}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// Test Case Generator
function TestCaseRenderer({ data }: { data: Record<string, any> }) {
  const testCases = (data.testCases as Array<Record<string, any>> | undefined) ?? [];
  const suites = (data.testSuites as Array<Record<string, any>> | undefined) ?? [];
  const coverage = data.estimatedCoverage ?? data.coveragePercentage ?? null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile value={testCases.length || suites.reduce((s: number, suite: any) => s + (suite.tests?.length ?? 0), 0)} label="Test Cases" accent />
        <StatTile value={coverage != null ? `${Math.round(Number(coverage))}%` : "—"} label="Est. Coverage" accent={Number(coverage) >= 80} />
        <StatTile value={testCases.filter((t: any) => t.type === "unit").length || "—"} label="Unit Tests" />
        <StatTile value={testCases.filter((t: any) => t.type === "integration").length || "—"} label="Integration" />
      </div>

      {data.summary && (
        <SectionCard title="Coverage Summary">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </SectionCard>
      )}

      {/* Test suites */}
      {suites.length > 0 && (
        <SectionCard title={`Test Suites (${suites.length})`}>
          <div className="space-y-4">
            {suites.slice(0, 5).map((suite: any, i: number) => (
              <div key={i}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium">{suite.name ?? suite.describe}</span>
                  <Badge variant="default" size="xs">{suite.tests?.length ?? 0} tests</Badge>
                </div>
                {suite.code && (
                  <pre className="text-[11px] font-mono text-muted bg-surface rounded-lg p-3 border border-border-subtle overflow-x-auto leading-relaxed max-h-48">
                    {String(suite.code).slice(0, 600)}{String(suite.code).length > 600 ? "\n..." : ""}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Individual test cases if no suites */}
      {testCases.length > 0 && suites.length === 0 && (
        <SectionCard title={`Test Cases (${testCases.length})`}>
          <div className="space-y-2">
            {testCases.slice(0, 10).map((tc: any, i: number) => (
              <div key={i} className="flex items-start gap-2 py-2 border-b border-border-subtle last:border-0">
                <Badge variant={tc.type === "unit" ? "success" : tc.type === "integration" ? "info" : "default"} size="xs">{tc.type ?? "test"}</Badge>
                <div>
                  <div className="text-xs font-medium">{tc.name ?? tc.description}</div>
                  {tc.scenario && <div className="text-xs text-muted">{tc.scenario}</div>}
                </div>
              </div>
            ))}
            {testCases.length > 10 && <p className="text-xs text-muted">+ {testCases.length - 10} more test cases</p>}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// Test Cases / Test Data / Scaffolding / Data Lineage — Generic rich renderer
function GenericRichRenderer({ data, domainType }: { data: Record<string, any>; domainType: string }) {
  const narrative = data.narrative ?? data.summary ?? data.answer ?? data.description ?? null;
  const filteredEntries = Object.entries(data).filter(([k]) =>
    !["brainAttribution", "claudePowered", "brainCausalEnriched", "causalCascade"].includes(k)
  );
  return (
    <div className="space-y-5">
      {narrative && (
        <SectionCard title="Summary">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{narrative}</p>
        </SectionCard>
      )}
      {/* Render top-level arrays as lists, strings as text */}
      {filteredEntries.map(([key, value]) => {
        if (key === "narrative" || key === "summary" || key === "answer" || key === "description") return null;
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
          return (
            <SectionCard key={key} title={key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}>
              <ul className="space-y-1.5">
                {(value as string[]).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-accent mt-0.5 shrink-0">→</span>
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          );
        }
        if (typeof value === "string" && value.length > 100) {
          return (
            <SectionCard key={key} title={key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed overflow-auto max-h-64">
                {value}
              </pre>
            </SectionCard>
          );
        }
        return null;
      })}
      {/* Raw JSON fallback */}
      <SectionCard title="Full Output">
        <pre className="text-xs leading-relaxed overflow-auto max-h-96 whitespace-pre-wrap text-muted-foreground">
          {JSON.stringify(
            Object.fromEntries(
              filteredEntries.filter(([k]) => !["narrative","summary","answer","description"].includes(k))
            ),
            null, 2
          )}
        </pre>
      </SectionCard>
    </div>
  );
}

// ── Shared UI primitives ──────────────────────────────────────────────────

function StatTile({
  value,
  label,
  accent = false,
  danger = false,
}: {
  value: string | number;
  label: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-0.5 ${
      danger
        ? "border-danger/30 bg-danger/5"
        : accent
        ? "border-accent/30 bg-accent/5"
        : "border-border-subtle bg-surface/40"
    }`}>
      <div className="text-[9px] font-bold uppercase tracking-widest text-muted">{label}</div>
      <div className={`text-lg font-bold tabular-nums leading-tight ${
        danger ? "text-danger" : accent ? "text-accent-light" : "text-foreground"
      }`}>
        {value}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  padding = true,
}: {
  title: string;
  children: React.ReactNode;
  padding?: boolean;
}) {
  return (
    <Card variant="default" padding="none">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted">{title}</h4>
      </div>
      <div className={padding ? "p-4" : ""}>{children}</div>
    </Card>
  );
}

// ── AAAS: Bookkeeper — Journal Entries & GL Classification ───────────────

function BookkeeperRenderer({ data }: { data: Record<string, any> }) {
  const journalEntries = (data.journalEntries as Array<Record<string, any>> | undefined)
    ?? (data.entries as Array<Record<string, any>> | undefined) ?? [];
  const classifications = (data.classifications as Array<Record<string, any>> | undefined) ?? [];
  const summary = data.summary ?? data.narrative ?? null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile value={journalEntries.length} label="Journal Entries" accent={journalEntries.length > 0} />
        <StatTile value={classifications.length} label="Classifications" />
        <StatTile value={data.totalDebit ?? "—"} label="Total Debit" />
        <StatTile value={data.totalCredit ?? "—"} label="Total Credit" />
      </div>
      {summary && (
        <SectionCard title="Summary">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{summary}</p>
        </SectionCard>
      )}
      {journalEntries.length > 0 && (
        <SectionCard title={`Journal Entries (${journalEntries.length})`} padding={false}>
          <div className="divide-y divide-border-subtle">
            {journalEntries.slice(0, 20).map((entry, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                <span className="text-[10px] text-muted font-mono w-20 shrink-0">{entry.date ?? entry.created_at ?? "—"}</span>
                <span className="flex-1 font-medium">{entry.description ?? entry.narration ?? entry.memo ?? "—"}</span>
                <span className="text-muted shrink-0">{entry.account ?? entry.accountName ?? "—"}</span>
                {entry.debit != null && <span className="text-green-400 tabular-nums w-20 text-right">{entry.debit}</span>}
                {entry.credit != null && <span className="text-red-400 tabular-nums w-20 text-right">{entry.credit}</span>}
              </div>
            ))}
            {journalEntries.length > 20 && (
              <div className="px-4 py-2 text-xs text-muted">+ {journalEntries.length - 20} more entries</div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── AAAS: Reconciler ─────────────────────────────────────────────────────

function ReconcilerRenderer({ data }: { data: Record<string, any> }) {
  const matchedItems = (data.matchedItems as Array<Record<string, any>> | undefined)
    ?? (data.matches as Array<Record<string, any>> | undefined) ?? [];
  const unmatched = (data.unmatchedItems as Array<Record<string, any>> | undefined)
    ?? (data.discrepancies as Array<Record<string, any>> | undefined) ?? [];
  const summary = data.summary ?? data.narrative ?? null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile value={matchedItems.length} label="Matched" accent={matchedItems.length > 0} />
        <StatTile value={unmatched.length} label="Unmatched" danger={unmatched.length > 0} />
        <StatTile value={data.matchRate != null ? `${Math.round(data.matchRate * 100)}%` : "—"} label="Match Rate" accent={(data.matchRate ?? 0) > 0.9} />
        <StatTile value={data.variance ?? data.totalVariance ?? "—"} label="Total Variance" danger={(data.variance ?? 0) > 0} />
      </div>
      {summary && (
        <SectionCard title="Reconciliation Summary">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{summary}</p>
        </SectionCard>
      )}
      {unmatched.length > 0 && (
        <SectionCard title={`Unmatched Items (${unmatched.length})`} padding={false}>
          <div className="divide-y divide-border-subtle">
            {unmatched.slice(0, 15).map((item, i) => (
              <div key={i} className="px-4 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  {severityBadge(item.severity ?? "warning")}
                  <span className="text-xs font-medium">{item.description ?? item.reference ?? `Item ${i + 1}`}</span>
                  <span className="ml-auto text-xs text-muted font-mono">{item.amount ?? "—"}</span>
                </div>
                {item.source && <p className="text-[10px] text-muted">Source: {item.source}</p>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── AAAS: Tax Compliance ─────────────────────────────────────────────────

function TaxComplianceRenderer({ data }: { data: Record<string, any> }) {
  const issues = (data.complianceIssues as Array<Record<string, any>> | undefined)
    ?? (data.issues as Array<Record<string, any>> | undefined) ?? [];
  const summary = data.summary ?? data.narrative ?? null;
  const gstData = data.gstF5 ?? data.gst ?? null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile value={issues.length} label="Compliance Issues" danger={issues.length > 0} />
        <StatTile value={data.complianceScore != null ? `${data.complianceScore}%` : "—"} label="Compliance Score" accent={(data.complianceScore ?? 0) >= 90} />
        <StatTile value={data.taxLiability ?? data.totalTax ?? "—"} label="Tax Liability" />
      </div>
      {summary && (
        <SectionCard title="Tax Summary">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{summary}</p>
        </SectionCard>
      )}
      {gstData && (
        <SectionCard title="GST F5 Summary">
          <div className="grid grid-cols-2 gap-3 text-xs">
            {Object.entries(gstData).filter(([k]) => typeof gstData[k] !== "object").map(([k, v]) => (
              <div key={k} className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-muted">{k.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
                <span className="font-semibold tabular-nums">{String(v)}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {issues.length > 0 && (
        <SectionCard title="Compliance Issues" padding={false}>
          <div className="divide-y divide-border-subtle">
            {issues.map((iss, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  {severityBadge(iss.severity ?? "warning")}
                  <span className="text-sm font-medium">{iss.title ?? iss.description ?? `Issue ${i + 1}`}</span>
                </div>
                {iss.detail && <p className="text-xs text-muted">{iss.detail}</p>}
                {iss.recommendation && <p className="text-xs text-accent mt-1">Fix: {iss.recommendation}</p>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── AAAS: Audit Preparer ─────────────────────────────────────────────────

function AuditRenderer({ data }: { data: Record<string, any> }) {
  const workpapers = (data.workpapers as Array<Record<string, any>> | undefined)
    ?? (data.auditItems as Array<Record<string, any>> | undefined) ?? [];
  const controlTests = (data.controlTests as Array<Record<string, any>> | undefined) ?? [];
  const summary = data.summary ?? data.narrative ?? null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile value={workpapers.length} label="Workpapers" accent={workpapers.length > 0} />
        <StatTile value={controlTests.length} label="Control Tests" />
        <StatTile value={data.readinessScore != null ? `${data.readinessScore}%` : "—"} label="Audit Readiness" accent={(data.readinessScore ?? 0) >= 80} />
      </div>
      {summary && (
        <SectionCard title="Audit Preparation Summary">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{summary}</p>
        </SectionCard>
      )}
      {workpapers.length > 0 && (
        <SectionCard title={`Workpapers (${workpapers.length})`} padding={false}>
          <div className="divide-y divide-border-subtle">
            {workpapers.slice(0, 15).map((wp, i) => (
              <div key={i} className="px-4 py-2.5">
                <div className="text-xs font-medium">{wp.title ?? wp.name ?? `Workpaper ${i + 1}`}</div>
                {wp.area && <Badge variant="default" size="xs" className="mt-1">{wp.area}</Badge>}
                {wp.status && <span className={`text-[10px] ml-2 ${wp.status === "complete" ? "text-success" : "text-warning"}`}>{wp.status}</span>}
                {wp.description && <p className="text-xs text-muted mt-0.5">{wp.description}</p>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── AAAS: Anomaly Detective ──────────────────────────────────────────────

function AnomalyRenderer({ data }: { data: Record<string, any> }) {
  const anomalies = (data.anomalies as Array<Record<string, any>> | undefined)
    ?? (data.items as Array<Record<string, any>> | undefined) ?? [];
  const benfords = data.benfordsResult ?? data.benfordsLaw ?? null;
  const summary = data.summary ?? data.narrative ?? null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile value={anomalies.length} label="Anomalies Found" danger={anomalies.length > 3} />
        <StatTile value={anomalies.filter((a: any) => (a.severity ?? "").toLowerCase() === "critical").length} label="Critical" danger />
        <StatTile value={benfords ? (benfords.passes ? "Pass" : "Fail") : "—"} label="Benford's Law" danger={benfords && !benfords.passes} />
      </div>
      {summary && (
        <SectionCard title="Anomaly Summary">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{summary}</p>
        </SectionCard>
      )}
      {benfords && !benfords.passes && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🔮</span>
            <span className="text-sm font-semibold text-danger">Benford&apos;s Law Deviation</span>
          </div>
          <p className="text-xs text-muted">{benfords.explanation ?? "First-digit distribution deviates significantly from expected Benford's Law pattern, suggesting potential irregularities."}</p>
        </div>
      )}
      {anomalies.length > 0 && (
        <SectionCard title={`Anomalies (${anomalies.length})`} padding={false}>
          <div className="divide-y divide-border-subtle">
            {anomalies.map((a, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  {severityBadge(a.severity ?? "warning")}
                  <span className="text-sm font-medium">{a.title ?? a.description ?? `Anomaly ${i + 1}`}</span>
                  {a.amount != null && <span className="ml-auto text-xs font-mono text-muted">{a.amount}</span>}
                </div>
                {a.detail && <p className="text-xs text-muted">{a.detail}</p>}
                {a.account && <p className="text-[10px] text-muted">Account: {a.account}</p>}
                {a.explanation && <p className="text-xs text-accent mt-1">{a.explanation}</p>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── AAAS: Financial Statements ───────────────────────────────────────────

function FinancialStatementsRenderer({ data }: { data: Record<string, any> }) {
  const pl = data.profitAndLoss ?? null;
  const bs = data.balanceSheet ?? null;
  const tb = data.trialBalance ?? null;
  const summary = data.summary ?? data.narrative ?? null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {pl?.totalRevenue != null && <StatTile value={pl.totalRevenue} label="Revenue" accent />}
        {pl?.netIncome != null && <StatTile value={pl.netIncome} label="Net Income" accent={(pl.netIncome ?? 0) > 0} danger={(pl.netIncome ?? 0) < 0} />}
        {bs?.totalAssets != null && <StatTile value={bs.totalAssets} label="Total Assets" />}
        {bs?.totalLiabilities != null && <StatTile value={bs.totalLiabilities} label="Total Liabilities" />}
      </div>
      {summary && (
        <SectionCard title="Financial Summary">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{summary}</p>
        </SectionCard>
      )}
      {pl && (
        <SectionCard title="Profit & Loss">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed overflow-auto max-h-80">
            {typeof pl === "string" ? pl : JSON.stringify(pl, null, 2)}
          </pre>
        </SectionCard>
      )}
      {bs && (
        <SectionCard title="Balance Sheet">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed overflow-auto max-h-80">
            {typeof bs === "string" ? bs : JSON.stringify(bs, null, 2)}
          </pre>
        </SectionCard>
      )}
      {tb && (
        <SectionCard title="Trial Balance">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed overflow-auto max-h-80">
            {typeof tb === "string" ? tb : JSON.stringify(tb, null, 2)}
          </pre>
        </SectionCard>
      )}
    </div>
  );
}

// ── P0: Early Warning — Velocity Collapse + Bottleneck Concentration ─────

function EarlyWarningRenderer({ data }: { data: Record<string, any> }) {
  const predictions = (data.predictions as Array<Record<string, any>> | undefined) ?? [];
  const bottlenecks = (data.bottlenecks as Array<Record<string, any>> | undefined) ?? [];
  const signals: Array<Record<string, any>> = (data.signals as Array<Record<string, any>> | undefined)
    ?? (data.drivingSignals as string[] | undefined)?.map(s => ({ description: s } as Record<string, any>))
    ?? [];
  const recommendations = (data.recommendations as string[] | undefined)
    ?? (data.actions as string[] | undefined) ?? [];
  const spofAlerts = (data.spofAlerts as Array<Record<string, any>> | undefined)
    ?? (data.spof ? [data.spof] : []);
  const sprintVelocity = (data.sprintVelocity as Array<Record<string, any>> | undefined)
    ?? (data.velocityHistory as Array<Record<string, any>> | undefined) ?? [];

  // Extract top-level velocity fields
  const currentVelocity = data.currentVelocity ?? data.current_velocity ?? null;
  const previousVelocity = data.previousVelocity ?? data.previous_velocity ?? null;
  const declinePct = data.declinePct ?? data.decline_pct ?? data.velocityDropPct ?? null;
  const riskWindow = data.riskWindow ?? data.risk_window ?? data.sprintsToCollapse ?? null;
  const confidence = data.confidence ?? data.predictionConfidence ?? null;
  const riskLevel = (data.riskLevel ?? data.risk_level ?? "").toUpperCase();
  const engagementName = data.engagementName ?? data.engagement_name ?? data.teamName ?? data.team_name ?? "";
  const clientName = data.clientName ?? data.client_name ?? "";

  // Feature set breakdown
  const featureSet = data.featureSet ?? data.features ?? null;
  const prFlow = featureSet?.prFlow ?? data.prFlow ?? null;
  const reviewHealth = featureSet?.reviewHealth ?? data.reviewHealth ?? null;
  const wipMetrics = featureSet?.wip ?? data.wip ?? null;
  const loadMetrics = featureSet?.load ?? data.load ?? null;

  return (
    <div className="space-y-5">
      {/* Risk header */}
      {riskLevel && (
        <div className="flex items-center gap-3 flex-wrap">
          {severityBadge(riskLevel === "HIGH" ? "critical" : riskLevel === "MEDIUM" ? "warning" : "info")}
          <span className="text-sm font-semibold">
            {clientName ? `${clientName} — ` : ""}{engagementName}
          </span>
          {riskLevel && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
              riskLevel === "HIGH" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
            }`}>
              {riskLevel} RISK
            </span>
          )}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          value={currentVelocity != null ? `${currentVelocity} pts` : "—"}
          label="Current Velocity"
          danger={declinePct != null && Math.abs(declinePct) > 20}
        />
        <StatTile
          value={previousVelocity != null ? `${previousVelocity} pts` : "—"}
          label="Previous Velocity"
        />
        <StatTile
          value={declinePct != null ? `${declinePct > 0 ? "-" : "+"}${Math.abs(declinePct)}%` : "—"}
          label="Decline"
          danger={declinePct != null && Math.abs(declinePct) > 20}
        />
        <StatTile
          value={riskWindow != null ? `${riskWindow} sprints` : "—"}
          label="Risk Window"
          danger={riskWindow != null && riskWindow <= 2}
        />
      </div>

      {/* Confidence */}
      {confidence != null && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Prediction confidence:</span>
          <span className="font-semibold tabular-nums">
            {typeof confidence === "number" && confidence <= 1
              ? `${(confidence * 100).toFixed(0)}%`
              : `${confidence}%`}
          </span>
          {typeof confidence === "number" && (confidence > 0.7 || confidence > 70) && (
            <span className="text-success">Above threshold</span>
          )}
        </div>
      )}

      {/* Sprint Velocity Trend */}
      {sprintVelocity.length > 0 && (
        <SectionCard title="Sprint Velocity Trend">
          <div className="space-y-2">
            {sprintVelocity.map((sprint, i) => {
              const vel = sprint.velocity ?? sprint.points ?? sprint.value ?? 0;
              const maxVel = Math.max(...sprintVelocity.map((s: any) => s.velocity ?? s.points ?? s.value ?? 0), 1);
              const pct = (vel / maxVel) * 100;
              const color = i === sprintVelocity.length - 1
                ? (pct < 60 ? "bg-red-500" : pct < 80 ? "bg-yellow-400" : "bg-green-500")
                : "bg-green-500";
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[10px] text-muted w-20 shrink-0 text-right font-mono">
                    {sprint.sprintName ?? sprint.sprint ?? sprint.name ?? `Sprint ${i + 1}`}
                  </span>
                  <div className="flex-1 h-2 bg-surface-elevated rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%`, transition: "width 0.4s ease" }} />
                  </div>
                  <span className="text-xs font-semibold tabular-nums w-8 text-right">{vel}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Feature Set Breakdown — P0-01 spec */}
      {(prFlow || reviewHealth || wipMetrics || loadMetrics) && (
        <SectionCard title="Feature Set — Rolling 14-Day Window">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {prFlow && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">PR Flow</div>
                {prFlow.meanCycleTime != null && <div className="text-xs">Mean cycle time: <span className="font-semibold">{prFlow.meanCycleTime}h</span></div>}
                {prFlow.cycleTimeVariance != null && <div className="text-xs">Cycle time variance: <span className="font-semibold">{prFlow.cycleTimeVariance}</span></div>}
                {prFlow.openPrCount != null && <div className="text-xs">Open PRs: <span className="font-semibold">{prFlow.openPrCount}</span></div>}
                {prFlow.mergeRate != null && <div className="text-xs">Merge rate: <span className="font-semibold">{(prFlow.mergeRate * 100).toFixed(0)}%</span></div>}
                {prFlow.prSizeMean != null && <div className="text-xs">Avg PR size: <span className="font-semibold">{prFlow.prSizeMean} LOC</span></div>}
                {prFlow.reviewerCountPerPr != null && <div className="text-xs">Reviewers/PR: <span className="font-semibold">{prFlow.reviewerCountPerPr}</span></div>}
              </div>
            )}
            {reviewHealth && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Review Health</div>
                {reviewHealth.meanReviewLatency != null && <div className="text-xs">Mean review latency: <span className="font-semibold">{reviewHealth.meanReviewLatency}h</span></div>}
                {reviewHealth.reviewConcentrationIndex != null && (
                  <div className="text-xs">
                    Gini coefficient: <span className={`font-semibold ${reviewHealth.reviewConcentrationIndex > 0.5 ? "text-danger" : ""}`}>
                      {reviewHealth.reviewConcentrationIndex.toFixed(2)}
                    </span>
                    {reviewHealth.reviewConcentrationIndex > 0.5 && <span className="text-danger text-[10px] ml-1">High concentration</span>}
                  </div>
                )}
              </div>
            )}
            {wipMetrics && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Work in Progress</div>
                {wipMetrics.openPrTrend != null && <div className="text-xs">Open PR trend: <span className="font-semibold">{wipMetrics.openPrTrend}</span></div>}
                {wipMetrics.ticketsInProgress != null && <div className="text-xs">Tickets in progress: <span className="font-semibold">{wipMetrics.ticketsInProgress}</span></div>}
                {wipMetrics.avgTicketCycleTime != null && <div className="text-xs">Avg ticket cycle time: <span className="font-semibold">{wipMetrics.avgTicketCycleTime}d</span></div>}
              </div>
            )}
            {loadMetrics && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Load</div>
                {loadMetrics.prsPerEngineer != null && <div className="text-xs">PRs/engineer: <span className="font-semibold">{loadMetrics.prsPerEngineer}</span></div>}
                {loadMetrics.ticketsPerEngineer != null && <div className="text-xs">Tickets/engineer: <span className="font-semibold">{loadMetrics.ticketsPerEngineer}</span></div>}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* SPOF / Bottleneck Alerts — P0-02 spec */}
      {spofAlerts.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">⚡</span>
            <span className="text-sm font-semibold">SPOF / Bottleneck Alert</span>
          </div>
          {spofAlerts.map((spof, i) => (
            <div key={i} className="space-y-2">
              <p className="text-sm">{spof.description ?? spof.message ?? spof.alert ?? `${spof.engineerName ?? "Engineer"} owns ${spof.commitPct ?? spof.reviewPct ?? "—"}% of ${spof.area ?? "commits"}`}</p>
              {spof.engineerName && (
                <div className="text-xs text-muted">Engineer: <span className="font-semibold text-foreground">{spof.engineerName}</span></div>
              )}
              {spof.reviewLatencyHours != null && (
                <div className="text-xs text-muted">Avg review latency caused: <span className="font-semibold text-warning">{spof.reviewLatencyHours}h</span></div>
              )}
              {spof.unavailabilitySimulation && (
                <div className="text-xs text-muted">If unavailable for 5 days: <span className="font-semibold text-danger">{spof.unavailabilitySimulation}</span></div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bottleneck Concentration Metrics — P0-02 spec */}
      {bottlenecks.length > 0 && (
        <SectionCard title="Bottleneck Concentration Risk" padding={false}>
          <div className="divide-y divide-border-subtle">
            {bottlenecks.map((b, i) => (
              <div key={i} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{b.engineerName ?? b.name ?? `Reviewer ${i + 1}`}</span>
                  {b.brsScore != null && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      b.brsScore > 70 ? "bg-danger/10 text-danger" : b.brsScore > 40 ? "bg-warning/10 text-warning" : "bg-surface text-muted"
                    }`}>
                      BRS {b.brsScore}/100
                    </span>
                  )}
                  {b.trend && (
                    <span className={`text-[10px] ${b.trend === "worsening" ? "text-danger" : b.trend === "improving" ? "text-success" : "text-muted"}`}>
                      {b.trend === "worsening" ? "↗ Worsening" : b.trend === "improving" ? "↘ Improving" : "→ Stable"}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {b.prSharePct != null && (
                    <div className="bg-surface-elevated rounded p-2">
                      <div className="text-[10px] text-muted">PR share</div>
                      <div className="font-semibold">{b.prSharePct}%</div>
                    </div>
                  )}
                  {b.giniCoefficient != null && (
                    <div className="bg-surface-elevated rounded p-2">
                      <div className="text-[10px] text-muted">Gini</div>
                      <div className="font-semibold">{b.giniCoefficient.toFixed(2)}</div>
                    </div>
                  )}
                  {b.hhi != null && (
                    <div className="bg-surface-elevated rounded p-2">
                      <div className="text-[10px] text-muted">HHI</div>
                      <div className={`font-semibold ${b.hhi > 0.25 ? "text-danger" : ""}`}>{b.hhi.toFixed(3)}</div>
                    </div>
                  )}
                  {b.betweennessCentrality != null && (
                    <div className="bg-surface-elevated rounded p-2">
                      <div className="text-[10px] text-muted">Betweenness</div>
                      <div className="font-semibold">{b.betweennessCentrality.toFixed(2)}</div>
                    </div>
                  )}
                </div>
                {b.repos && (
                  <div className="text-xs text-muted">Concentrated in: <span className="font-mono">{Array.isArray(b.repos) ? b.repos.join(", ") : b.repos}</span></div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Under-utilized reviewers — P0-02 spec */}
      {data.underUtilizedReviewers && (data.underUtilizedReviewers as Array<Record<string, any>>).length > 0 && (
        <SectionCard title="Under-Utilized Reviewers">
          <p className="text-xs text-muted mb-2">Engineers who reviewed fewer than 5 PRs in the last 14 days — candidates to absorb load.</p>
          <div className="flex flex-wrap gap-2">
            {(data.underUtilizedReviewers as Array<Record<string, any>>).map((r, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border-subtle">
                <span className="text-xs font-medium">{r.name ?? r.engineerName}</span>
                <span className="text-[10px] text-muted">{r.reviewCount ?? r.prsReviewed ?? 0} PRs</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Driving Signals — P0-01 spec */}
      {signals.length > 0 && (
        <SectionCard title="Driving Signals">
          <div className="space-y-2">
            {signals.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <span className="shrink-0 mt-0.5 text-warning">⚠</span>
                <span className="text-muted-foreground">{typeof s === "string" ? s : s.description ?? s.signal ?? s.message}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Predictions */}
      {predictions.length > 0 && (
        <SectionCard title="Velocity Predictions" padding={false}>
          <div className="divide-y divide-border-subtle">
            {predictions.map((p, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{p.teamName ?? p.team ?? p.engagement ?? `Team ${i + 1}`}</span>
                  {severityBadge(p.risk ?? p.severity ?? "info")}
                </div>
                <p className="text-xs text-muted">
                  Predicted: <span className="font-semibold">{p.predictedVelocity ?? p.predicted}</span>
                  {p.baseline != null && <> vs baseline <span className="font-semibold">{p.baseline}</span></>}
                  {p.confidence != null && <> · {typeof p.confidence === "number" && p.confidence <= 1 ? `${(p.confidence * 100).toFixed(0)}%` : `${p.confidence}%`} confidence</>}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Recommended Actions — P0-01 spec */}
      {recommendations.length > 0 && (
        <SectionCard title="Recommended Actions">
          <ol className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">{r}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}
    </div>
  );
}

// ── P0: Scope Creep — Drift Detection ────────────────────────────────────

function ScopeCreepRenderer({ data }: { data: Record<string, any> }) {
  const alerts = (data.alerts as Array<Record<string, any>> | undefined)
    ?? (data.scope_alerts as Array<Record<string, any>> | undefined) ?? [];
  const engagements = (data.engagements as Array<Record<string, any>> | undefined) ?? [];
  const rootCause = data.rootCause ?? data.root_cause ?? null;
  const recommendations = (data.recommendations as string[] | undefined) ?? [];
  const totalAlerts = alerts.length;
  const criticalCount = alerts.filter(a => (a.severity ?? "").toLowerCase() === "critical").length;

  // Build drift items (either from alerts or engagements)
  const driftItems = engagements.length > 0
    ? engagements
    : alerts.map(a => ({
        name: a.engagements?.engagement_name ?? a.engagement_name ?? a.engagement_id ?? "Unknown",
        clientName: a.engagements?.client_name ?? a.client_name ?? "",
        severity: a.severity,
        deltaPct: a.delta_pct ?? a.deltaPct,
        baselinePts: a.baseline_pts ?? a.baselinePts,
        currentPts: a.current_pts ?? a.currentPts,
        sprintName: a.sprint_name ?? a.sprintName,
        message: a.alert_message ?? a.message,
      }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile value={totalAlerts} label="Scope Alerts" danger={criticalCount > 0} />
        <StatTile value={criticalCount} label="Critical" danger={criticalCount > 0} />
        <StatTile
          value={driftItems.length > 0 ? `${driftItems.length}` : "—"}
          label="Engagements Affected"
        />
        <StatTile
          value={driftItems.length > 0 ? `+${Math.max(...driftItems.map((d: any) => d.deltaPct ?? 0))}%` : "—"}
          label="Max Drift"
          danger={driftItems.some((d: any) => (d.deltaPct ?? 0) > 25)}
        />
      </div>

      {/* Drift bars per engagement */}
      {driftItems.length > 0 && (
        <SectionCard title="Scope Drift by Engagement">
          <div className="space-y-3">
            {driftItems.map((item: any, i: number) => {
              const drift = item.deltaPct ?? 0;
              const maxDrift = Math.max(...driftItems.map((d: any) => Math.abs(d.deltaPct ?? 0)), 1);
              const barPct = Math.min(100, (Math.abs(drift) / maxDrift) * 100);
              const barColor = Math.abs(drift) > 25 ? "bg-red-500" : Math.abs(drift) > 10 ? "bg-yellow-400" : "bg-green-500";
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {item.severity && severityBadge(item.severity)}
                      <span className="text-xs font-semibold">
                        {item.clientName ? `${item.clientName} — ` : ""}{item.name ?? item.engagement_name}
                      </span>
                    </div>
                    <span className={`text-xs font-bold tabular-nums ${Math.abs(drift) > 25 ? "text-danger" : "text-warning"}`}>
                      {drift > 0 ? "+" : ""}{drift}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-surface-elevated rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barPct}%`, transition: "width 0.4s ease" }} />
                    </div>
                  </div>
                  {(item.baselinePts != null || item.currentPts != null) && (
                    <div className="text-[10px] text-muted mt-0.5">
                      Baseline {item.baselinePts ?? "—"} → Current {item.currentPts ?? "—"} pts
                      {item.sprintName && <span className="ml-1">· {item.sprintName}</span>}
                    </div>
                  )}
                  {item.message && (
                    <p className="text-[11px] text-muted mt-0.5">{item.message}</p>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Root Cause */}
      {rootCause && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🔍</span>
            <span className="text-sm font-semibold">Root Cause</span>
          </div>
          <p className="text-sm text-muted-foreground">{rootCause}</p>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <SectionCard title="Recommended Actions">
          <ol className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">{r}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}
    </div>
  );
}

// ── P0: Engagement Health — Health Score Dashboard ────────────────────────

function EngagementHealthRenderer({ data }: { data: Record<string, any> }) {
  const healthScores = (data.health_scores as Array<Record<string, any>> | undefined)
    ?? (data.healthScores as Array<Record<string, any>> | undefined)
    ?? (data.engagements as Array<Record<string, any>> | undefined) ?? [];
  const scopeAlerts = (data.scope_alerts as Array<Record<string, any>> | undefined) ?? [];
  const engineerSummary = (data.engineer_health_summary ?? data.engineerHealthSummary ?? null) as Record<string, any> | null;
  const activeCount = healthScores.filter((h: any) => (h.status ?? "active") === "active").length;
  const atRiskCount = healthScores.filter((h: any) => h.health_score < 50 || h.forecast_at_risk).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile value={healthScores.length} label="Engagements" accent={healthScores.length > 0} />
        <StatTile value={activeCount} label="Active" />
        <StatTile value={atRiskCount} label="At Risk" danger={atRiskCount > 0} />
        <StatTile value={scopeAlerts.length} label="Scope Alerts" danger={scopeAlerts.length > 0} />
      </div>

      {/* Engagement Health Cards */}
      {healthScores.length > 0 && (
        <SectionCard title="Engagement Health Scores" padding={false}>
          <div className="divide-y divide-border-subtle">
            {healthScores.map((eng: any, i: number) => {
              const score = eng.health_score ?? eng.healthScore ?? 0;
              const scoreColor = score >= 75 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-red-400";
              const ringColor = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
              return (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-center gap-3 mb-2">
                    {/* Mini health ring */}
                    <div className="relative w-10 h-10 shrink-0">
                      <svg width={40} height={40} style={{ transform: "rotate(-90deg)" }}>
                        <circle cx={20} cy={20} r={16} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
                        <circle cx={20} cy={20} r={16} fill="none" stroke={ringColor} strokeWidth={3} strokeLinecap="round"
                          strokeDasharray={`${(score / 100) * (2 * Math.PI * 16)} ${2 * Math.PI * 16}`} />
                      </svg>
                      <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${scoreColor}`}>{Math.round(score)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold">{eng.client_name ?? eng.clientName}</span>
                        <span className="text-[10px] text-muted">{eng.engagement_name ?? eng.engagementName}</span>
                      </div>
                    </div>
                    {eng.forecast_at_risk && (
                      <span className="text-[10px] font-bold text-danger bg-danger/10 px-2 py-0.5 rounded">AT RISK</span>
                    )}
                  </div>
                  {/* Score bars */}
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: "Delivery", value: eng.delivery_velocity ?? eng.deliveryVelocity },
                      { label: "Jira", value: eng.jira_resolution_rate ?? eng.jiraResolutionRate },
                      { label: "Scope", value: eng.scope_drift ?? eng.scopeDrift },
                      { label: "Balance", value: eng.team_concentration ?? eng.teamConcentration },
                      { label: "Sentiment", value: eng.slack_sentiment ?? eng.slackSentiment },
                    ].map((metric, j) => {
                      const v = metric.value ?? 0;
                      const c = v >= 75 ? "bg-green-500" : v >= 50 ? "bg-yellow-400" : "bg-red-500";
                      return (
                        <div key={j}>
                          <div className="text-[9px] text-muted mb-0.5">{metric.label}</div>
                          <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${c}`} style={{ width: `${Math.min(100, v)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Forecast */}
                  {eng.forecast_days_remaining != null && (
                    <div className={`mt-2 text-[10px] ${eng.forecast_at_risk ? "text-danger" : "text-success"}`}>
                      {eng.forecast_at_risk ? "⚠ At risk" : "✓ On track"} — ~{eng.forecast_days_remaining} days
                      {eng.forecast_confidence != null && ` · ${Math.round((eng.forecast_confidence ?? 0) * 100)}% conf.`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Engineer Health Summary */}
      {engineerSummary && (
        <SectionCard title="Engineer Health Summary">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile value={engineerSummary.total_engineers ?? engineerSummary.totalEngineers ?? 0} label="Total Engineers" />
            <StatTile value={engineerSummary.at_risk_count ?? engineerSummary.atRiskCount ?? 0} label="At Risk" danger={(engineerSummary.at_risk_count ?? 0) > 0} />
            <StatTile value={engineerSummary.overallocated_count ?? engineerSummary.overallocatedCount ?? 0} label="Overloaded" danger={(engineerSummary.overallocated_count ?? 0) > 0} />
            <StatTile value={`${engineerSummary.avg_review_burden ?? engineerSummary.avgReviewBurden ?? 0} PRs/wk`} label="Review Burden" />
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── P0: Pod Match — Team Recommendation ──────────────────────────────────

function PodMatchRenderer({ data }: { data: Record<string, any> }) {
  const matches = (data.pod_matches as Array<Record<string, any>> | undefined)
    ?? (data.podMatches as Array<Record<string, any>> | undefined)
    ?? (data.matches as Array<Record<string, any>> | undefined)
    ?? (data.recommended_pod_name ? [data] : []);

  return (
    <div className="space-y-5">
      {data.summary && (
        <SectionCard title="Match Summary">
          <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </SectionCard>
      )}

      {matches.map((match: any, i: number) => {
        const ev = match.evidence ?? {};
        const matchPct = Math.round((ev.matchScore ?? match.confidence ?? 0) * 100);
        const techStack = ev.techStackMatch ?? ev.techStack ?? [];
        const pastEng = ev.pastEngagements ?? [];

        return (
          <div key={i} className="rounded-xl border border-border-subtle bg-surface/40 p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-muted font-bold uppercase tracking-wider">
                  {i === 0 ? "Recommended Pod" : `Alternative ${i}`}
                </div>
                <div className="text-base font-bold">{match.recommended_pod_name ?? match.podName ?? match.name}</div>
              </div>
              <div className="flex flex-col items-end">
                <span className={`text-2xl font-black tabular-nums ${
                  matchPct >= 80 ? "text-green-400" : matchPct >= 60 ? "text-yellow-400" : "text-red-400"
                }`}>
                  {matchPct}<span className="text-sm font-normal text-muted">%</span>
                </span>
                <span className="text-[10px] text-muted">match</span>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ev.avgCycleTimeHours != null && (
                <StatTile value={`${ev.avgCycleTimeHours}h`} label="Avg Cycle Time" />
              )}
              {ev.weeklyPrCount != null && (
                <StatTile value={ev.weeklyPrCount} label="PRs / Week" />
              )}
              {ev.techStackOverlapScore != null && (
                <StatTile value={`${Math.round(ev.techStackOverlapScore * 100)}%`} label="Tech Overlap" accent />
              )}
              {match.confidence != null && (
                <StatTile value={`${Math.round(match.confidence * 100)}%`} label="Confidence" />
              )}
            </div>

            {/* Tech Stack */}
            {techStack.length > 0 && (
              <div>
                <div className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1.5">Tech Stack</div>
                <div className="flex flex-wrap gap-1.5">
                  {techStack.map((tech: string, j: number) => (
                    <span key={j} className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Past Engagements */}
            {pastEng.length > 0 && (
              <div>
                <div className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1.5">Past Engagements</div>
                <div className="space-y-1.5">
                  {pastEng.map((p: any, j: number) => (
                    <div key={j} className="flex items-center justify-between text-xs py-1 border-b border-border-subtle last:border-0">
                      <div>
                        <span className="font-medium">{p.engagementName ?? p.name}</span>
                        {p.clientName && <span className="text-muted ml-1">({p.clientName})</span>}
                      </div>
                      <span className={`font-semibold tabular-nums ${
                        (p.healthScore ?? 0) >= 75 ? "text-green-400" : (p.healthScore ?? 0) >= 50 ? "text-yellow-400" : "text-red-400"
                      }`}>
                        Score: {p.healthScore ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Domain renderer dispatcher ────────────────────────────────────────────

function renderDomain(domainType: string, data: Record<string, any>) {
  switch (domainType) {
    // P0 — Delivery Intelligence
    case "early-warning":          return <EarlyWarningRenderer data={data} />;
    case "scope-creep":            return <ScopeCreepRenderer data={data} />;
    case "delivery-intelligence":  return <EngagementHealthRenderer data={data} />;
    case "pod-match":              return <PodMatchRenderer data={data} />;
    // P1 — Code Intelligence + others
    case "pr-review":            return <PRReviewRenderer data={data} />;
    case "tdd":                  return <TDDRenderer data={data} />;
    case "design-doc-generator": return <DesignDocRenderer data={data} />;
    case "dependency-upgrade":   return <DepUpgradeRenderer data={data} />;
    case "incident-diagnosis":   return <IncidentRCARenderer data={data} />;
    case "impact-analysis":      return <ImpactAnalysisRenderer data={data} />;
    case "sql-analyzer":         return <SQLAnalyzerRenderer data={data} />;
    case "performance-profiler": return <PerfProfilerRenderer data={data} />;
    case "log-query":            return <LogQueryRenderer data={data} />;
    case "dead-code-detector":   return <DeadCodeRenderer data={data} />;
    case "codebase-qa":          return <CodebaseQARenderer data={data} />;
    case "architecture-extractor": return <ArchitectureRenderer data={data} />;
    case "boilerplate-scaffold":   return <ScaffoldingRenderer data={data} />;
    case "data-lineage":           return <DataLineageRenderer data={data} />;
    case "test-case-generator":    return <TestCaseRenderer data={data} />;
    case "test-data-generator":    return <TestCaseRenderer data={data} />;
    // AAAS — Accounting Intelligence
    case "aas-bookkeep":           return <BookkeeperRenderer data={data} />;
    case "aas-reconcile":          return <ReconcilerRenderer data={data} />;
    case "aas-statements":
    case "aas-full":
    case "aas-financial":          return <FinancialStatementsRenderer data={data} />;
    case "aas-tax":                return <TaxComplianceRenderer data={data} />;
    case "aas-audit":              return <AuditRenderer data={data} />;
    case "aas-anomaly":            return <AnomalyRenderer data={data} />;
    default:
      return <GenericRichRenderer data={data} domainType={domainType} />;
  }
}

// ── Main page ─────────────────────────────────────────────────────────────

export default async function ArtifactDetailPage({
  params,
}: {
  params: Promise<{ artifactId: string }>;
}) {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();
  const { artifactId } = await params;

  const { data: artifact } = await supabase
    .from("se_aas_artifacts")
    .select("*")
    .eq("id", artifactId)
    .eq("organization_id", workspaceId)
    .single();

  if (!artifact) notFound();

  const meta = DOMAIN_META[artifact.domain_type] ?? {
    label: artifact.domain_type,
    icon: "📄",
    colorClass: "text-muted",
    bgClass: "bg-surface",
    ringClass: "border-border-subtle",
  };

  const artifactData = (artifact.artifact_data ?? {}) as Record<string, any>;
  const confidence = artifactData?.confidence ?? artifactData?.overallScore ?? null;

  return (
    <div className="space-y-6 max-w-4xl">

      {/* ── Breadcrumb ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-muted mb-2">
          <Link href="/se-aas" className="hover:text-foreground transition-colors">
            Engineering Intelligence
          </Link>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <Link href="/se-aas/artifacts" className="hover:text-foreground transition-colors">
            Artifacts
          </Link>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="font-mono">{artifactId.slice(0, 8)}…</span>
        </div>

        {/* ── Artifact header ────────────────────────────────────────── */}
        <Card variant={artifactData.brainCausalEnriched ? "brain-highlight" : "elevated"} padding="md">
          <div className="flex items-start gap-4">
            {/* Domain icon */}
            <div className={`w-12 h-12 rounded-xl border flex items-center justify-center text-2xl shrink-0 ${meta.bgClass} ${meta.ringClass}`}>
              {meta.icon}
            </div>

            {/* Title + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-lg font-semibold">{meta.label}</h1>
                <Badge variant="default" size="xs" className={`font-mono ${meta.colorClass}`}>
                  {artifact.domain_type}
                </Badge>
                {artifactData.claudePowered && (
                  <Badge variant="accent" size="xs">Claude-powered</Badge>
                )}
                {artifactData.brainCausalEnriched && (
                  <Badge variant="info" size="xs">🧠 Brain Intelligence</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
                <span className="font-mono">{artifactId}</span>
                <span>·</span>
                <span>
                  {new Date(artifact.created_at).toLocaleString("en-US", {
                    month: "long", day: "numeric", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
                {confidence != null && (
                  <>
                    <span>·</span>
                    <span>
                      {typeof confidence === "number" && confidence <= 1
                        ? `${(confidence * 100).toFixed(0)}% accuracy`
                        : `Score ${confidence}`}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Copilot CTA */}
            <Link
              href={`/copilot?service=seaas&q=${encodeURIComponent(
                `Analyse this ${meta.label} artifact (${artifactId}) and give me Brain insights and recommended next steps`
              )}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-xs font-medium transition-colors shrink-0"
            >
              🧠 Ask Brain
            </Link>
          </div>
        </Card>
      </div>

      {/* ── Domain content ────────────────────────────────────────────── */}
      {renderDomain(artifact.domain_type, artifactData)}

    </div>
  );
}
