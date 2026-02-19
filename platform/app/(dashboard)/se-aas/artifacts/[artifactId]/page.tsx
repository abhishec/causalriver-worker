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
import { getCurrentOrgId } from "@/lib/org-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

// ── Domain metadata ───────────────────────────────────────────────────────

const DOMAIN_META: Record<string, { label: string; icon: string; colorClass: string; bgClass: string; ringClass: string }> = {
  "early-warning":        { label: "Early Warning",   icon: "⚡", colorClass: "text-red-400",    bgClass: "bg-red-500/8",    ringClass: "border-red-500/25" },
  "pr-review":            { label: "PR Review",        icon: "🔍", colorClass: "text-blue-400",   bgClass: "bg-blue-500/8",   ringClass: "border-blue-500/25" },
  "tdd":                  { label: "TDD Agent",         icon: "🧪", colorClass: "text-green-400",  bgClass: "bg-green-500/8",  ringClass: "border-green-500/25" },
  "boilerplate-scaffold": { label: "Scaffolding",      icon: "🏗️", colorClass: "text-purple-400", bgClass: "bg-purple-500/8", ringClass: "border-purple-500/25" },
  "dependency-upgrade":   { label: "Dep Upgrade",      icon: "📦", colorClass: "text-orange-400", bgClass: "bg-orange-500/8", ringClass: "border-orange-500/25" },
  "design-doc-generator": { label: "HLD / LLD",        icon: "📐", colorClass: "text-cyan-400",   bgClass: "bg-cyan-500/8",   ringClass: "border-cyan-500/25" },
  "test-case-generator":  { label: "Test Cases",       icon: "✅", colorClass: "text-emerald-400",bgClass: "bg-emerald-500/8",ringClass: "border-emerald-500/25" },
  "test-data-generator":  { label: "Test Data",        icon: "🎲", colorClass: "text-teal-400",   bgClass: "bg-teal-500/8",   ringClass: "border-teal-500/25" },
  "codebase-qa":          { label: "Codebase Q&A",     icon: "💬", colorClass: "text-violet-400", bgClass: "bg-violet-500/8", ringClass: "border-violet-500/25" },
  "dead-code-detector":   { label: "Dead Code",        icon: "🧹", colorClass: "text-gray-400",   bgClass: "bg-gray-500/8",   ringClass: "border-gray-500/25" },
  "impact-analysis":      { label: "Impact Analysis",  icon: "💥", colorClass: "text-red-400",    bgClass: "bg-red-500/8",    ringClass: "border-red-500/25" },
  "incident-diagnosis":   { label: "Incident RCA",     icon: "🚨", colorClass: "text-pink-400",   bgClass: "bg-pink-500/8",   ringClass: "border-pink-500/25" },
  "log-query":            { label: "Log Query",         icon: "📋", colorClass: "text-yellow-400", bgClass: "bg-yellow-500/8", ringClass: "border-yellow-500/25" },
  "performance-profiler": { label: "Perf Profiler",    icon: "⚡", colorClass: "text-amber-400",  bgClass: "bg-amber-500/8",  ringClass: "border-amber-500/25" },
  "sql-analyzer":         { label: "SQL Analyzer",     icon: "🗄️", colorClass: "text-blue-400",   bgClass: "bg-blue-500/8",   ringClass: "border-blue-500/25" },
  "data-lineage":         { label: "Data Lineage",     icon: "🔗", colorClass: "text-indigo-400", bgClass: "bg-indigo-500/8", ringClass: "border-indigo-500/25" },
  "architecture-extractor":  { label: "Architecture",    icon: "🏛️", colorClass: "text-sky-400",   bgClass: "bg-sky-500/8",   ringClass: "border-sky-500/25" },
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
            Based on Brain&apos;s analysis of your organisation&apos;s historical patterns,
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
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile value={`${data.qualityScore ?? "—"}/100`} label="Quality Score" accent={data.qualityScore >= 70} />
        <StatTile value={openDecisions.length} label="Open Decisions" danger={openDecisions.length > 3} />
        <StatTile value={patterns.length} label="Patterns Detected" />
      </div>
      {data.hld?.fullMarkdown && (
        <SectionCard title="High-Level Design">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed overflow-auto max-h-80">
            {data.hld.fullMarkdown}
          </pre>
        </SectionCard>
      )}
      {data.lld?.fullMarkdown && (
        <SectionCard title="Low-Level Design">
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

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile value={services.length} label="Services" accent={services.length > 0} />
        <StatTile value={dataFlows.length} label="Data Flows" />
        <StatTile value={riskAreas.filter((r: any) => r.severity === "high").length} label="High Risks" danger={riskAreas.filter((r: any) => r.severity === "high").length > 0} />
        <StatTile value={techStack.length} label="Tech Stack" />
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
        ? "border-blue-500/30 bg-blue-500/5"
        : "border-border-subtle bg-surface/40"
    }`}>
      <div className="text-[9px] font-bold uppercase tracking-widest text-muted">{label}</div>
      <div className={`text-lg font-bold tabular-nums leading-tight ${
        danger ? "text-danger" : accent ? "text-blue-400" : "text-foreground"
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

// ── Domain renderer dispatcher ────────────────────────────────────────────

function renderDomain(domainType: string, data: Record<string, any>) {
  switch (domainType) {
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
  const orgId = await getCurrentOrgId();
  const { artifactId } = await params;

  const { data: artifact } = await supabase
    .from("se_aas_artifacts")
    .select("*")
    .eq("id", artifactId)
    .eq("organization_id", orgId)
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
