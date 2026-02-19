/**
 * SE-AAS Artifact Detail Page
 * ============================
 *
 * Renders the full output of any SE-AAS domain execution:
 * - PR Review: comments, causal cascade, risk level
 * - TDD Agent: generated tests with coverage estimate
 * - HLD/LLD: full markdown + Mermaid diagrams
 * - Dependency Upgrade: outdated packages, breaking changes, migration steps
 * - Bottleneck/Velocity: early warning report
 * - All others: structured data rendered appropriately
 *
 * This follows the same pattern as AAS artifact viewer.
 */

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const DOMAIN_LABELS: Record<string, { label: string; icon: string }> = {
  "early-warning":        { label: "Early Warning",   icon: "⚡" },
  "pr-review":            { label: "PR Review",        icon: "🔍" },
  "tdd":                  { label: "TDD Agent",         icon: "🧪" },
  "boilerplate-scaffold": { label: "Scaffolding",    icon: "🏗️" },
  "dependency-upgrade":   { label: "Dep Upgrade",      icon: "📦" },
  "design-doc-generator": { label: "HLD / LLD",     icon: "📐" },
  "test-case-generator":  { label: "Test Cases",     icon: "✅" },
  "test-data-generator":  { label: "Test Data",      icon: "🎲" },
  "codebase-qa":          { label: "Codebase Q&A",    icon: "💬" },
  "dead-code-detector":   { label: "Dead Code",       icon: "🧹" },
  "impact-analysis":      { label: "Impact Analysis", icon: "💥" },
  "incident-diagnosis":   { label: "Incident RCA",    icon: "🚨" },
  "log-query":            { label: "Log Query",        icon: "📋" },
  "performance-profiler": { label: "Perf Profiler", icon: "⚡" },
  "sql-analyzer":         { label: "SQL Analyzer",    icon: "🗄️" },
  "data-lineage":         { label: "Data Lineage",    icon: "🔗" },
};

// ── Sub-renderers ─────────────────────────────────────────────────────────

function PRReviewArtifact({ data }: { data: Record<string, any> }) {
  const causalCascade = data.causalCascade as Array<{
    domain: string; relationship: string; effectSize: number; confidence: number; lagDays: number; severity: string;
  }> | undefined;

  return (
    <div className="space-y-4">
      {/* Score + Risk */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg bg-surface border border-border-subtle p-3">
          <div className="text-xl font-bold">{data.overallScore ?? "—"}</div>
          <div className="text-xs text-muted">Overall Score</div>
        </div>
        <div className={`rounded-lg border p-3 ${
          data.approved ? "bg-success/5 border-success/30" : "bg-danger/5 border-danger/30"
        }`}>
          <div className="text-xl font-bold">{data.approved ? "✅" : "❌"}</div>
          <div className="text-xs text-muted">{data.approved ? "Approved" : "Changes Requested"}</div>
        </div>
        <div className="rounded-lg bg-surface border border-border-subtle p-3">
          <div className="text-xl font-bold capitalize">{data.riskLevel ?? "—"}</div>
          <div className="text-xs text-muted">Risk Level</div>
        </div>
        <div className="rounded-lg bg-surface border border-border-subtle p-3">
          <div className="text-xl font-bold">{data.comments?.length ?? 0}</div>
          <div className="text-xs text-muted">Comments</div>
        </div>
      </div>

      {/* Summary */}
      {data.summary && (
        <div className="rounded-lg bg-surface border border-border-subtle p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted mb-2">Summary</div>
          <p className="text-sm leading-relaxed">{data.summary}</p>
        </div>
      )}

      {/* Causal Cascade — THE "WOW" MOMENT */}
      {causalCascade && causalCascade.length > 0 && (
        <div className="rounded-xl bg-gradient-to-r from-indigo-500/5 to-purple-500/5 border border-indigo-500/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span>🧠</span>
            <h4 className="text-sm font-medium">Brain Causal Cascade</h4>
            <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-medium">
              L4 Causal Graph
            </span>
          </div>
          <p className="text-xs text-muted mb-3">
            Merging this PR affects the <strong>engineering domain</strong>, which has downstream causal effects:
          </p>
          <div className="space-y-2">
            {causalCascade.map((c, i) => (
              <div key={i} className={`rounded-lg border p-3 flex items-start gap-3 ${
                c.severity === "critical" ? "border-danger/30 bg-danger/5" :
                c.severity === "high" ? "border-warning/30 bg-warning/5" :
                "border-border-subtle bg-surface"
              }`}>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  c.severity === "critical" ? "bg-danger/10 text-danger" :
                  c.severity === "high" ? "bg-warning/10 text-warning" :
                  "bg-surface text-muted border border-border-subtle"
                }`}>
                  {c.severity}
                </span>
                <div className="flex-1">
                  <div className="text-sm">{c.relationship}</div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted">
                    <span>Domain: <strong>{c.domain}</strong></span>
                    <span>Effect size: <strong>{c.effectSize.toFixed(2)}</strong></span>
                    <span>Confidence: <strong>{(c.confidence * 100).toFixed(0)}%</strong></span>
                    <span>Manifests in: <strong>~{c.lagDays}d</strong></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      {data.comments && data.comments.length > 0 && (
        <div className="rounded-lg bg-card border border-border-subtle overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle">
            <h4 className="text-sm font-medium">Review Comments ({data.comments.length})</h4>
          </div>
          <div className="divide-y divide-border-subtle">
            {data.comments.map((c: any, i: number) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    c.severity === "critical" ? "bg-danger/10 text-danger" :
                    c.severity === "error" ? "bg-danger/10 text-danger" :
                    c.severity === "warning" ? "bg-warning/10 text-warning" :
                    "bg-surface text-muted border border-border-subtle"
                  }`}>{c.severity}</span>
                  <span className="text-[10px] text-muted bg-surface border border-border-subtle px-1.5 py-0.5 rounded">{c.category}</span>
                  <span className="text-xs text-muted ml-auto font-mono">{c.file}:{c.line}</span>
                </div>
                <p className="text-sm">{c.message}</p>
                {c.suggestion && (
                  <p className="text-xs text-accent mt-1">💡 {c.suggestion}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations && data.recommendations.length > 0 && (
        <div className="rounded-lg bg-surface border border-border-subtle p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted mb-2">Recommendations</div>
          <ul className="space-y-1.5">
            {data.recommendations.map((r: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-accent mt-0.5">→</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DesignDocArtifact({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-surface border border-border-subtle p-3">
          <div className="text-xl font-bold">{data.qualityScore ?? "—"}/100</div>
          <div className="text-xs text-muted">Quality Score</div>
        </div>
        <div className="rounded-lg bg-surface border border-border-subtle p-3">
          <div className="text-xl font-bold">{data.openDecisions?.length ?? 0}</div>
          <div className="text-xs text-muted">Open Decisions</div>
        </div>
        <div className="rounded-lg bg-surface border border-border-subtle p-3">
          <div className="text-xl font-bold">{data.patterns?.length ?? 0}</div>
          <div className="text-xs text-muted">Patterns Detected</div>
        </div>
      </div>

      {data.hld?.fullMarkdown && (
        <div className="rounded-lg bg-surface border border-border-subtle p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted mb-3">High-Level Design</div>
          <pre className="text-xs whitespace-pre-wrap leading-relaxed overflow-auto max-h-96">{data.hld.fullMarkdown}</pre>
        </div>
      )}

      {data.lld?.fullMarkdown && (
        <div className="rounded-lg bg-surface border border-border-subtle p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted mb-3">Low-Level Design</div>
          <pre className="text-xs whitespace-pre-wrap leading-relaxed overflow-auto max-h-96">{data.lld.fullMarkdown}</pre>
        </div>
      )}

      {data.openDecisions && data.openDecisions.length > 0 && (
        <div className="rounded-lg bg-card border border-border-subtle p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted mb-3">Open Decisions</div>
          <div className="space-y-3">
            {data.openDecisions.map((d: any, i: number) => (
              <div key={i} className="border border-border-subtle rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{d.question}</span>
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
                    d.impact === "high" ? "bg-danger/10 text-danger" : "bg-surface text-muted border border-border-subtle"
                  }`}>{d.impact} impact</span>
                </div>
                <p className="text-xs text-accent">Recommendation: {d.recommendation}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {d.options?.map((o: string, j: number) => (
                    <span key={j} className="text-[10px] bg-surface border border-border-subtle px-1.5 py-0.5 rounded">{o}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DependencyUpgradeArtifact({ data }: { data: Record<string, any> }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg bg-surface border border-border-subtle p-3">
          <div className="text-xl font-bold">{data.upgradeRiskScore ?? "—"}/100</div>
          <div className="text-xs text-muted">Risk Score</div>
        </div>
        <div className="rounded-lg bg-surface border border-border-subtle p-3">
          <div className="text-xl font-bold">{data.outdated?.length ?? 0}</div>
          <div className="text-xs text-muted">Outdated</div>
        </div>
        <div className={`rounded-lg border p-3 ${
          (data.securityIssues?.length ?? 0) > 0 ? "bg-danger/5 border-danger/30" : "bg-surface border-border-subtle"
        }`}>
          <div className="text-xl font-bold">{data.securityIssues?.length ?? 0}</div>
          <div className="text-xs text-muted">Security Issues</div>
        </div>
        <div className="rounded-lg bg-surface border border-border-subtle p-3">
          <div className="text-xl font-bold">{data.breakingChanges?.length ?? 0}</div>
          <div className="text-xs text-muted">Breaking Changes</div>
        </div>
      </div>

      {data.securityIssues?.length > 0 && (
        <div className="rounded-lg bg-danger/5 border border-danger/30 p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-danger mb-3">Security Issues</div>
          <div className="space-y-2">
            {data.securityIssues.map((s: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  s.severity === "critical" ? "bg-danger text-white" : "bg-danger/10 text-danger"
                }`}>{s.severity}</span>
                <div>
                  <strong>{s.dependency}</strong> → upgrade to {s.fixedInVersion}
                  {s.cve && <span className="ml-1 text-[10px] text-muted font-mono">{s.cve}</span>}
                  <div className="text-xs text-muted mt-0.5">{s.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.migrationSteps?.length > 0 && (
        <div className="rounded-lg bg-surface border border-border-subtle p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted mb-3">Migration Steps</div>
          <div className="space-y-3">
            {data.migrationSteps.map((s: any, i: number) => (
              <div key={i} className="border-l-2 border-accent pl-3">
                <div className="text-xs text-muted">{s.order}. {s.dependency}</div>
                <div className="text-sm">{s.action}</div>
                {s.code && (
                  <pre className="text-xs bg-surface rounded mt-1 p-2 overflow-auto">{s.code}</pre>
                )}
                {s.testCommand && (
                  <div className="text-xs text-muted mt-1">Test: <code className="font-mono">{s.testCommand}</code></div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GenericArtifact({ data }: { data: Record<string, any> }) {
  // Pull out narrative/summary if available
  const narrative = data.narrative ?? data.summary ?? data.answer ?? null;
  const filteredData = { ...data };
  delete filteredData.brainAttribution;
  delete filteredData.claudePowered;

  return (
    <div className="space-y-4">
      {narrative && (
        <div className="rounded-lg bg-surface border border-border-subtle p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted mb-2">Summary</div>
          <p className="text-sm leading-relaxed">{narrative}</p>
        </div>
      )}
      <div className="rounded-lg bg-surface border border-border-subtle p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted mb-2">Artifact Data</div>
        <pre className="text-xs leading-relaxed overflow-auto max-h-[500px] whitespace-pre-wrap">
          {JSON.stringify(filteredData, null, 2)}
        </pre>
      </div>
    </div>
  );
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

  if (!artifact) {
    notFound();
  }

  const meta = DOMAIN_LABELS[artifact.domain_type];
  const artifactData = artifact.artifact_data as Record<string, any>;
  const confidence = artifactData?.confidence ?? artifactData?.overallScore;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb + header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-1">
          <Link href="/se-aas" className="hover:text-foreground transition-colors">Engineering Intelligence</Link>
          <span>/</span>
          <Link href="/se-aas/artifacts" className="hover:text-foreground transition-colors">Artifacts</Link>
          <span>/</span>
          <span className="font-mono">{artifactId.slice(0, 8)}…</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta?.icon ?? "📄"}</span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {meta?.label ?? artifact.domain_type}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted font-mono">{artifactId}</span>
              <span className="text-xs text-muted">·</span>
              <span className="text-xs text-muted">
                {new Date(artifact.created_at).toLocaleString("en-US", {
                  month: "long", day: "numeric", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
              {confidence != null && (
                <>
                  <span className="text-xs text-muted">·</span>
                  <span className="text-xs text-muted">
                    {typeof confidence === "number" && confidence <= 1
                      ? `${(confidence * 100).toFixed(0)}% confidence`
                      : `Score ${confidence}`}
                  </span>
                </>
              )}
              {artifactData?.claudePowered && (
                <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded font-medium">
                  Claude-powered
                </span>
              )}
              {artifactData?.brainCausalEnriched && (
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-medium">
                  🧠 Brain causal
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Domain-specific renderer */}
      {artifact.domain_type === "pr-review" ? (
        <PRReviewArtifact data={artifactData} />
      ) : artifact.domain_type === "design-doc-generator" ? (
        <DesignDocArtifact data={artifactData} />
      ) : artifact.domain_type === "dependency-upgrade" ? (
        <DependencyUpgradeArtifact data={artifactData} />
      ) : (
        <GenericArtifact data={artifactData} />
      )}

      {/* Ask Brain about this artifact */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-500/5 to-purple-500/5 border border-indigo-500/20 p-4 flex items-center gap-4">
        <span className="text-2xl">🧠</span>
        <div className="flex-1">
          <div className="text-sm font-medium">Ask Brain about this artifact</div>
          <div className="text-xs text-muted mt-0.5">
            Dig deeper with causal intelligence, historical patterns, and cross-domain insights
          </div>
        </div>
        <Link
          href={`/copilot?service=seaas&q=${encodeURIComponent(
            `Analyse this ${meta?.label ?? artifact.domain_type} artifact (${artifactId}) and give me Brain causal insights and recommended next steps`
          )}`}
          className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-xs font-medium transition-colors flex-shrink-0"
        >
          Open in Copilot →
        </Link>
      </div>
    </div>
  );
}
