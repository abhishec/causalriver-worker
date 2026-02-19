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
import { DOMAIN_CATALOGUE, DOMAIN_LABEL_MAP, type DomainEntry } from "@/lib/se-aas/domain-catalogue";

export const dynamic = "force-dynamic";
export const metadata = { title: "SE-AAS · Engineering Intelligence" };

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
                      {domain.href ? "Open Tool" : "Ask in Copilot"}
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
