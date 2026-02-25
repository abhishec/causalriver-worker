import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import Link from "next/link";
import { EarlyWarningActions } from "./actions";
import { ReviewerDistributionChart, BRSBreakdown } from "./bottleneck-charts";
import { VelocityTrendChart } from "./velocity-chart";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";


export const metadata = { title: "Early Warning System" };

export default async function EarlyWarningPage() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  // ── Fetch all data in parallel ──────────────────────────────────────────
  const [
    { data: githubConnector },
    { data: velocitySnapshots },
    { data: bottleneckSnapshots },
    { data: causalEdges },
    { data: brainAlerts },
  ] = await Promise.all([
    supabase
      .from("org_connectors")
      .select("config")
      .eq("organization_id", workspaceId)
      .eq("connector_type", "github")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("velocity_snapshots")
      .select("*")
      .eq("organization_id", workspaceId)
      .order("snapshot_date", { ascending: false })
      .limit(30),
    supabase
      .from("bottleneck_snapshots")
      .select("*")
      .eq("organization_id", workspaceId)
      .order("snapshot_date", { ascending: false })
      .limit(2),
    supabase
      .from("causal_relationships_statistical")
      .select("source_domain, target_domain, source_metric, target_metric, effect_size, confidence, natural_language, optimal_lag_days")
      .eq("organization_id", workspaceId)
      .order("confidence", { ascending: false })
      .limit(10),
    supabase
      .from("ai_memory")
      .select("content, metadata, created_at")
      .eq("organization_id", workspaceId)
      .eq("memory_type", "alert")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const primaryBranch: string | null = githubConnector?.config?.primaryBranch ?? null;
  const releaseVersion: string | null = primaryBranch
    ? (githubConnector?.config?.releaseVersionMap?.[primaryBranch] ?? null)
    : null;
  const githubRepo: string | null = githubConnector?.config?.githubRepo ?? null;

  const latestBottleneck = bottleneckSnapshots?.[0];
  const prevBottleneck = bottleneckSnapshots?.[1];
  const latestVelocity = velocitySnapshots?.[0];

  // ── Velocity trend (7d vs prev 7d) ──────────────────────────────────────
  const last7Days = velocitySnapshots?.slice(0, 7) || [];
  const prev7Days = velocitySnapshots?.slice(7, 14) || [];
  const avgLast7 = last7Days.reduce((sum: number, s: any) => sum + (s.prs_merged || 0), 0) / (last7Days.length || 1);
  const avgPrev7 = prev7Days.reduce((sum: number, s: any) => sum + (s.prs_merged || 0), 0) / (prev7Days.length || 1);
  const velocityChange = avgPrev7 > 0 ? ((avgLast7 - avgPrev7) / avgPrev7) * 100 : 0;
  const isVelocityCollapse = velocityChange < -25;

  // ── BRS week-over-week trend ─────────────────────────────────────────────
  const brsNow = latestBottleneck?.bottleneck_risk_score ?? null;
  const brsPrev = prevBottleneck?.bottleneck_risk_score ?? null;
  const brsDelta = brsNow != null && brsPrev != null ? brsNow - brsPrev : null;
  const brsTrend: 'improving' | 'stable' | 'worsening' | null =
    brsDelta == null ? null :
    brsDelta <= -5 ? 'improving' :
    brsDelta >= 5 ? 'worsening' : 'stable';

  // ── New P0 spec fields from snapshots ────────────────────────────────────
  // These are persisted as JSONB by analyze/route.ts after the last run
  const signalDrivers: Array<{ signal: string; description: string; importance: number; direction: string }> =
    (latestVelocity as any)?.signal_drivers ?? [];
  const recommendedAction: string | null = (latestVelocity as any)?.recommended_action ?? null;
  const leadTimeSprints: number = (latestVelocity as any)?.lead_time_sprints ?? 1;
  const engineersWithZeroMerges: string[] = (latestVelocity as any)?.engineers_with_zero_merges ?? [];
  const underUtilizedReviewers: Array<{ reviewer: string; reviewCount: number; capacityToAbsorb: number }> =
    (latestBottleneck as any)?.under_utilized_reviewers ?? [];
  const absenceSimulation: {
    blockedPRsEstimate: number;
    estimatedCycleTimeIncreaseHours: number;
    absorberCount: number;
    riskNarrative: string;
  } | null = (latestBottleneck as any)?.absence_simulation ?? null;

  // Engineering causal edges for Brain Intelligence card
  const engineeringCauses = (causalEdges || []).filter(
    (e: any) => e.source_domain === 'engineering' || e.target_domain === 'engineering'
  );

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Early Warning System</h1>
          <p className="text-xs text-muted mt-0.5">
            Brain-powered velocity collapse prediction + bottleneck concentration risk
          </p>
        </div>
        <Link
          href={`/copilot?q=${encodeURIComponent(
            isVelocityCollapse
              ? `Our deploy velocity dropped ${Math.abs(velocityChange).toFixed(0)}% in the last 7 days. ${latestBottleneck ? `Bottleneck risk score is ${latestBottleneck.bottleneck_risk_score?.toFixed(0) || 0}/100 (${latestBottleneck.risk_level}).` : ""} What's causing this and what should we do about it?`
              : latestBottleneck && latestBottleneck.risk_level === 'high'
                ? `Our bottleneck risk score is ${latestBottleneck.bottleneck_risk_score?.toFixed(0) || 0}/100 (${latestBottleneck.risk_level} risk). ${latestBottleneck.top_reviewer_login ? `Top reviewer ${latestBottleneck.top_reviewer_login} handles ${((latestBottleneck.top_reviewer_share || 0) * 100).toFixed(0)}% of reviews.` : ""} Analyze the root causes and recommend fixes.`
                : "Give me a full early warning analysis — velocity trends, bottleneck risks, and causal factors affecting our engineering health."
          )}`}
          className="px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Ask Brain
        </Link>
      </div>

      {/* ── Workspace / Branch Context ──────────────────────────────────────── */}
      {(primaryBranch || githubRepo) && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted">Scope:</span>
          {githubRepo && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono bg-surface border border-border-subtle text-muted">
              {githubRepo}
            </span>
          )}
          {primaryBranch && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              🌿 {primaryBranch}
            </span>
          )}
          {releaseVersion && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
              v{releaseVersion}
            </span>
          )}
          <span className="text-muted">· All metrics isolated to this AI Worker</span>
          <Link
            href="/se-aas"
            className="ml-auto text-accent hover:text-accent/80 transition-colors"
          >
            View SE-AAS Dashboard →
          </Link>
        </div>
      )}

      {/* ── Alert Payload Banner (P0 Spec: "which signals drove the warning") ─ */}
      {(isVelocityCollapse || (latestBottleneck && latestBottleneck.risk_level === 'high')) && (
        <Card variant="elevated" padding="md" className="border-l-4 border-l-danger">
          <div className="flex items-start gap-3">
            <div className="text-xl mt-0.5">🚨</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="text-sm font-semibold">Active Early Warning</h3>
                {isVelocityCollapse && (
                  <Badge variant="danger" size="sm">Velocity Collapse</Badge>
                )}
                {latestBottleneck?.risk_level === 'high' && (
                  <Badge variant="warning" size="sm">Bottleneck Critical</Badge>
                )}
                {leadTimeSprints >= 1 && (
                  <Badge variant="info" size="sm">⏱ {leadTimeSprints} sprint{leadTimeSprints > 1 ? 's' : ''} lead time</Badge>
                )}
              </div>
              <p className="text-xs text-muted mb-3">
                {isVelocityCollapse
                  ? `Deploy velocity dropped ${Math.abs(velocityChange).toFixed(0)}% in the last 7 days — below the 25% collapse threshold. Action required at least 1 sprint ahead.`
                  : `Reviewer concentration risk is critical. Top reviewer handles ${((latestBottleneck?.top_reviewer_share || 0) * 100).toFixed(0)}% of all reviews.`
                }
              </p>

              {/* Recommended Action — P0 spec requirement */}
              {recommendedAction && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-warning/10 border border-warning/20 mb-3">
                  <span className="text-sm">⚡</span>
                  <div>
                    <div className="text-xs font-semibold text-warning">Recommended Action</div>
                    <div className="text-xs text-foreground">{recommendedAction}</div>
                  </div>
                </div>
              )}

              {/* Signal Drivers — P0 spec: alert payload must show which signals drove the warning */}
              {signalDrivers.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
                    Signals driving this warning
                  </div>
                  <div className="space-y-1.5">
                    {signalDrivers.slice(0, 4).map((driver, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-24 shrink-0">
                          <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                driver.direction === 'decrease' ? 'bg-danger' :
                                driver.direction === 'spike' ? 'bg-warning' : 'bg-accent'
                              }`}
                              style={{ width: `${Math.round(driver.importance * 100)}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs text-foreground flex-1 min-w-0 truncate">{driver.description}</span>
                        <span className="text-[10px] text-muted shrink-0">
                          {Math.round(driver.importance * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Brain Intelligence Summary ──────────────────────────────────────── */}
      {(engineeringCauses.length > 0 || (brainAlerts && brainAlerts.length > 0)) && (
        <div className="rounded-xl bg-gradient-to-r from-indigo-500/5 to-purple-500/5 border border-indigo-500/20 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center text-xs">
                🧠
              </div>
              <h3 className="text-sm font-medium">Brain Intelligence</h3>
              <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded">
                {engineeringCauses.length} causal edges
              </span>
            </div>
            <Link
              href="/brain"
              className="text-[10px] text-accent hover:text-accent/80 font-medium transition-colors"
            >
              Explore in Brain →
            </Link>
          </div>

          {engineeringCauses.length > 0 && (
            <div className="space-y-2 mb-3">
              <div className="text-xs font-medium text-muted uppercase tracking-wider">Causal Relationships Discovered</div>
              {engineeringCauses.slice(0, 3).map((edge: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full ${edge.effect_size > 0 ? 'bg-success' : 'bg-danger'}`} />
                  <span className="text-foreground">{edge.natural_language}</span>
                  <span className="text-muted ml-auto">
                    {((edge.confidence || 0) * 100).toFixed(0)}% confidence
                  </span>
                </div>
              ))}
            </div>
          )}

          {brainAlerts && brainAlerts.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted uppercase tracking-wider">Recent Brain Alerts</div>
              {brainAlerts.slice(0, 2).map((alert: any, i: number) => {
                const meta = alert.metadata as any;
                const severity = meta?.severity || 'info';
                return (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 ${
                      severity === 'critical' ? 'text-danger' : severity === 'warning' ? 'text-warning' : 'text-muted'
                    }`}>
                      {severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️'}
                    </span>
                    <div>
                      <div className="text-foreground line-clamp-2">{alert.content}</div>
                      <div className="text-muted mt-0.5">
                        {new Date(alert.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                        {meta?.cognitive_layers_used && (
                          <span className="ml-2">
                            Layers: {(meta.cognitive_layers_used as string[]).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── P0 Alert Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Velocity Collapse Alert */}
        <Card
          variant={isVelocityCollapse ? "elevated" : "default"}
          padding="md"
          className={isVelocityCollapse ? "border-danger" : ""}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium">Velocity Collapse Risk</h3>
              <p className="text-xs text-muted mt-1">Deploy velocity trend</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {leadTimeSprints >= 1 && latestVelocity && (
                <Badge variant="accent" size="sm">
                  ⏱ {leadTimeSprints}+ sprint ahead
                </Badge>
              )}
              {isVelocityCollapse ? (
                <Badge variant="danger" size="sm" pulse>⚠️ High Risk</Badge>
              ) : (
                <Badge variant="success" size="sm">Healthy</Badge>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-2xl font-bold">
                {velocityChange >= 0 ? '+' : ''}{velocityChange.toFixed(1)}%
              </div>
              <div className="text-xs text-muted">7-day velocity change</div>
            </div>

            {latestVelocity && (
              <>
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border-subtle">
                  <div>
                    <div className="text-sm font-medium">{latestVelocity.prs_merged || 0}</div>
                    <div className="text-xs text-muted">PRs merged (last 7d)</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {latestVelocity.mean_pr_cycle_time_hours
                        ? `${(latestVelocity.mean_pr_cycle_time_hours / 24).toFixed(1)}d`
                        : '-'}
                    </div>
                    <div className="text-xs text-muted">Avg cycle time</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm font-medium">{latestVelocity.open_pr_count || 0}</div>
                    <div className="text-xs text-muted">Open PRs (WIP)</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {latestVelocity.mean_review_latency_hours
                        ? `${(latestVelocity.mean_review_latency_hours / 24).toFixed(1)}d`
                        : '-'}
                    </div>
                    <div className="text-xs text-muted">Review latency</div>
                  </div>
                </div>
              </>
            )}

            {/* Engineers with Zero Merges — P0 spec requirement */}
            {engineersWithZeroMerges.length > 0 && (
              <div className="pt-3 border-t border-border-subtle">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                    Engineers with 0 merges (7d)
                  </div>
                  <Badge variant="warning" size="sm">{engineersWithZeroMerges.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {engineersWithZeroMerges.slice(0, 6).map((eng, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-warning/10 text-warning border border-warning/20"
                    >
                      {eng}
                    </span>
                  ))}
                  {engineersWithZeroMerges.length > 6 && (
                    <span className="text-[10px] text-muted self-center">
                      +{engineersWithZeroMerges.length - 6} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Bottleneck Risk Alert */}
        <Card
          variant={latestBottleneck?.risk_level === 'high' ? "elevated" : "default"}
          padding="md"
          className={latestBottleneck?.risk_level === 'high' ? "border-warning" : ""}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium">Bottleneck Concentration</h3>
              <p className="text-xs text-muted mt-1">Reviewer concentration risk</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {/* BRS Week-over-Week Trend — P0 spec requirement */}
              {brsTrend && (
                <Badge
                  variant={brsTrend === 'improving' ? 'success' : brsTrend === 'worsening' ? 'danger' : 'default'}
                  size="sm"
                >
                  {brsTrend === 'improving' ? '↓' : brsTrend === 'worsening' ? '↑' : '→'} {brsTrend}
                </Badge>
              )}
              {latestBottleneck && (
                <Badge
                  variant={
                    latestBottleneck.risk_level === 'high' ? 'danger' :
                    latestBottleneck.risk_level === 'medium' ? 'warning' : 'success'
                  }
                  size="sm"
                  pulse={latestBottleneck.risk_level === 'high'}
                >
                  {latestBottleneck.risk_level === 'high' && '⚠️ '}
                  {latestBottleneck.risk_level === 'medium' && '⚡ '}
                  {latestBottleneck.risk_level === 'low' && '✓ '}
                  {latestBottleneck.risk_level} risk
                </Badge>
              )}
            </div>
          </div>

          {latestBottleneck ? (
            <div className="space-y-3">
              <div className="flex items-end gap-3">
                <div>
                  <div className="text-2xl font-bold">{latestBottleneck.bottleneck_risk_score?.toFixed(0) || 0}</div>
                  <div className="text-xs text-muted">Risk score (0–100)</div>
                </div>
                {brsDelta != null && (
                  <div className="mb-0.5">
                    <span className={`text-sm font-medium ${brsDelta > 0 ? 'text-danger' : brsDelta < 0 ? 'text-success' : 'text-muted'}`}>
                      {brsDelta > 0 ? '+' : ''}{brsDelta.toFixed(0)} vs last week
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border-subtle">
                <div>
                  <div className="text-sm font-medium">
                    {latestBottleneck.top_reviewer_share
                      ? `${(latestBottleneck.top_reviewer_share * 100).toFixed(0)}%`
                      : '-'}
                  </div>
                  <div className="text-xs text-muted">
                    Top reviewer{latestBottleneck.top_reviewer_login ? ` (${latestBottleneck.top_reviewer_login})` : ''}
                  </div>
                  {latestBottleneck.top_reviewer_share > 0.4 && (
                    <div className="text-[10px] text-danger mt-0.5">⚠️ Above 40% threshold</div>
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium">
                    {latestBottleneck.reviewer_gini_coefficient?.toFixed(2) || '-'}
                  </div>
                  <div className="text-xs text-muted">Gini coefficient</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className={`text-sm font-medium ${latestBottleneck.reviewer_hhi > 0.25 ? 'text-danger' : ''}`}>
                    {latestBottleneck.reviewer_hhi?.toFixed(3) || '-'}
                  </div>
                  <div className="text-xs text-muted">HHI index</div>
                  {latestBottleneck.reviewer_hhi > 0.25 && (
                    <div className="text-[10px] text-danger mt-0.5">⚠️ Condition A: Concentrated (&gt;0.25)</div>
                  )}
                </div>
                <div>
                  <div className={`text-sm font-medium ${latestBottleneck.max_betweenness_centrality > 0.35 ? 'text-danger' : ''}`}>
                    {latestBottleneck.max_betweenness_centrality
                      ? (latestBottleneck.max_betweenness_centrality * 100).toFixed(1) + '%'
                      : '-'}
                  </div>
                  <div className="text-xs text-muted">Betweenness centrality</div>
                  {latestBottleneck.max_betweenness_centrality > 0.35 && (
                    <div className="text-[10px] text-danger mt-0.5">⚠️ Condition C: &gt;2σ above team mean</div>
                  )}
                </div>
              </div>

              {/* ── P0-02 Bottleneck Trigger Conditions ─────────────────── */}
              <div className="pt-3 border-t border-border-subtle">
                <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
                  Bottleneck Trigger Conditions
                </div>
                <div className="space-y-1.5">
                  {/* Condition A: Top reviewer share */}
                  <div className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                      latestBottleneck.top_reviewer_share > 0.4 ? 'bg-danger/20 text-danger' : 'bg-success/20 text-success'
                    }`}>
                      {latestBottleneck.top_reviewer_share > 0.4 ? '✕' : '✓'}
                    </span>
                    <span className="text-[10px] text-muted flex-1">
                      <span className="font-semibold text-foreground">Condition A</span>{' '}
                      Top reviewer handles &gt;40% of merges
                      {latestBottleneck.top_reviewer_share
                        ? ` (currently ${(latestBottleneck.top_reviewer_share * 100).toFixed(0)}%)`
                        : ''}
                    </span>
                    <Badge
                      variant={latestBottleneck.top_reviewer_share > 0.4 ? 'danger' : 'success'}
                      size="xs"
                    >
                      {latestBottleneck.top_reviewer_share > 0.4 ? 'Triggered' : 'Clear'}
                    </Badge>
                  </div>

                  {/* Condition B: HHI > 0.25 */}
                  <div className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                      latestBottleneck.reviewer_hhi > 0.25 ? 'bg-danger/20 text-danger' : 'bg-success/20 text-success'
                    }`}>
                      {latestBottleneck.reviewer_hhi > 0.25 ? '✕' : '✓'}
                    </span>
                    <span className="text-[10px] text-muted flex-1">
                      <span className="font-semibold text-foreground">Condition B</span>{' '}
                      Review concentration (HHI) &gt; 0.25
                      {latestBottleneck.reviewer_hhi
                        ? ` (currently ${latestBottleneck.reviewer_hhi.toFixed(3)})`
                        : ''}
                    </span>
                    <Badge
                      variant={latestBottleneck.reviewer_hhi > 0.25 ? 'danger' : 'success'}
                      size="xs"
                    >
                      {latestBottleneck.reviewer_hhi > 0.25 ? 'Triggered' : 'Clear'}
                    </Badge>
                  </div>

                  {/* Condition C: Betweenness centrality z-score > 2 std dev */}
                  <div className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                      latestBottleneck.max_betweenness_centrality > 0.35 ? 'bg-danger/20 text-danger' : 'bg-success/20 text-success'
                    }`}>
                      {latestBottleneck.max_betweenness_centrality > 0.35 ? '✕' : '✓'}
                    </span>
                    <span className="text-[10px] text-muted flex-1">
                      <span className="font-semibold text-foreground">Condition C</span>{' '}
                      Betweenness centrality &gt;2σ above team mean
                      {latestBottleneck.max_betweenness_centrality
                        ? ` (currently ${(latestBottleneck.max_betweenness_centrality * 100).toFixed(1)}%)`
                        : ' (no data)'}
                    </span>
                    <Badge
                      variant={latestBottleneck.max_betweenness_centrality > 0.35 ? 'danger' : 'success'}
                      size="xs"
                    >
                      {latestBottleneck.max_betweenness_centrality > 0.35 ? 'Triggered' : 'Clear'}
                    </Badge>
                  </div>
                </div>
                <p className="text-[9px] text-muted mt-2">
                  SPOF alert fires when ≥1 condition is triggered. All 3 conditions active = critical risk.
                </p>
              </div>

              {/* ── Repository Breakdown — P0-02 spec: "which repos" ──── */}
              {latestBottleneck.repo_breakdown && Array.isArray(latestBottleneck.repo_breakdown) && latestBottleneck.repo_breakdown.length > 0 && (
                <div className="pt-3 border-t border-border-subtle">
                  <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
                    Repository Concentration
                  </div>
                  <div className="space-y-1.5">
                    {(latestBottleneck.repo_breakdown as Array<{ repo: string; reviewCount: number; share: number }>).map((r: { repo: string; reviewCount: number; share: number }, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted truncate w-32 shrink-0">{r.repo}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                          <div
                            className={`h-full rounded-full ${r.share > 0.5 ? 'bg-danger' : r.share > 0.3 ? 'bg-warning' : 'bg-accent'}`}
                            style={{ width: `${Math.round(r.share * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted tabular-nums shrink-0">
                          {Math.round(r.share * 100)}% ({r.reviewCount})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(!latestBottleneck.repo_breakdown || !Array.isArray(latestBottleneck.repo_breakdown) || latestBottleneck.repo_breakdown.length === 0) && githubRepo && (
                <div className="pt-3 border-t border-border-subtle">
                  <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
                    Repository
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-surface border border-border-subtle text-muted">
                    {githubRepo}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              }
              title="No bottleneck data yet"
              description="Connect your GitHub repository and run the bottleneck analysis to measure reviewer concentration risk."
              className="py-8"
            />
          )}
        </Card>
      </div>

      {/* ── Velocity Prediction (GBRT Model) ───────────────────────────────── */}
      {latestVelocity?.predicted_velocity != null && (
        <div className="rounded-xl bg-gradient-to-r from-blue-500/5 to-cyan-500/5 border border-blue-500/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center text-xs">
              📈
            </div>
            <h3 className="text-sm font-medium">Velocity Prediction</h3>
            <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded">
              Gradient Boosted Tree Model
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xl font-bold">{latestVelocity.predicted_velocity?.toFixed(1)}</div>
              <div className="text-xs text-muted">Predicted next sprint velocity</div>
            </div>
            <div>
              <div className="text-sm font-medium">
                [{latestVelocity.prediction_lower_bound?.toFixed(1) ?? '—'} — {latestVelocity.prediction_upper_bound?.toFixed(1) ?? '—'}]
              </div>
              <div className="text-xs text-muted">Confidence interval</div>
            </div>
            <div>
              <div className={`text-sm font-medium ${
                (latestVelocity.collapse_probability || 0) > 0.5 ? 'text-danger' : 'text-success'
              }`}>
                {((latestVelocity.collapse_probability || 0) * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-muted">Collapse probability</div>
            </div>
            <div>
              <div className="text-sm font-medium">
                {((latestVelocity.model_confidence || 0) * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-muted">Model confidence</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Under-Utilized Reviewers + Absence Simulation ──────────────────── */}
      {latestBottleneck && (underUtilizedReviewers.length > 0 || absenceSimulation) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Under-Utilized Reviewers — P0 spec: "who can absorb load" */}
          {underUtilizedReviewers.length > 0 && (
            <Card variant="default" padding="md">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-medium">Under-Utilized Reviewers</h3>
                <Badge variant="accent" size="sm">{underUtilizedReviewers.length} available</Badge>
              </div>
              <p className="text-xs text-muted mb-3">
                Engineers with &lt;5 PR reviews in the last 14 days — candidates to absorb load from{' '}
                <span className="font-medium text-foreground">{latestBottleneck.top_reviewer_login || 'top reviewer'}</span>.
              </p>
              <div className="space-y-2">
                {underUtilizedReviewers.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-t border-border-subtle first:border-t-0 first:pt-0">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-surface border border-border-subtle flex items-center justify-center text-[10px] font-mono font-medium">
                        {r.reviewer.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-medium font-mono">{r.reviewer}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted">{r.reviewCount} reviews (14d)</span>
                      <Badge variant="success" size="sm">+{r.capacityToAbsorb} capacity</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 5-Day Absence Simulation — P0 spec requirement */}
          {absenceSimulation && (
            <Card
              variant={absenceSimulation.absorberCount < 2 ? "elevated" : "default"}
              padding="md"
              className={absenceSimulation.absorberCount < 2 ? "border-danger" : ""}
            >
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-medium">5-Day Absence Simulation</h3>
                <Badge
                  variant={absenceSimulation.absorberCount < 2 ? "danger" : absenceSimulation.absorberCount < 3 ? "warning" : "success"}
                  size="sm"
                >
                  {absenceSimulation.absorberCount < 2 ? 'Critical' : absenceSimulation.absorberCount < 3 ? 'Moderate' : 'Resilient'}
                </Badge>
              </div>
              <p className="text-xs text-muted mb-3">
                Projected impact if <span className="font-medium text-foreground">{latestBottleneck.top_reviewer_login || 'top reviewer'}</span>{' '}
                is unavailable for 5 business days.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="p-2.5 rounded-lg bg-surface border border-border-subtle">
                  <div className={`text-lg font-bold ${absenceSimulation.blockedPRsEstimate > 5 ? 'text-danger' : 'text-warning'}`}>
                    ~{absenceSimulation.blockedPRsEstimate}
                  </div>
                  <div className="text-[10px] text-muted">PRs blocked</div>
                </div>
                <div className="p-2.5 rounded-lg bg-surface border border-border-subtle">
                  <div className={`text-lg font-bold ${absenceSimulation.estimatedCycleTimeIncreaseHours > 24 ? 'text-danger' : 'text-warning'}`}>
                    +{(absenceSimulation.estimatedCycleTimeIncreaseHours / 24).toFixed(1)}d
                  </div>
                  <div className="text-[10px] text-muted">Cycle time increase</div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-surface border border-border-subtle">
                <span className="text-sm mt-0.5 shrink-0">
                  {absenceSimulation.absorberCount < 2 ? '🔴' : absenceSimulation.absorberCount < 3 ? '🟡' : '🟢'}
                </span>
                <p className="text-xs text-muted">{absenceSimulation.riskNarrative}</p>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Reviewer Distribution + BRS Breakdown ──────────────────────────── */}
      {latestBottleneck && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium">Reviewer Distribution</h3>
              <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded">
                Review share %
              </span>
            </div>
            <ReviewerDistributionChart
              reviewerBreakdown={latestBottleneck.reviewer_breakdown || []}
            />
          </div>

          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium">Risk Score Breakdown</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                latestBottleneck.risk_level === 'high'
                  ? 'bg-danger/10 text-danger'
                  : latestBottleneck.risk_level === 'medium'
                  ? 'bg-warning/10 text-warning'
                  : 'bg-success/10 text-success'
              }`}>
                {latestBottleneck.risk_level}
              </span>
            </div>
            <BRSBreakdown
              reviewerBreakdown={latestBottleneck.reviewer_breakdown || []}
              riskScore={latestBottleneck.bottleneck_risk_score || 0}
              giniCoefficient={latestBottleneck.reviewer_gini_coefficient || 0}
              hhi={latestBottleneck.reviewer_hhi || 0}
              topReviewerShare={latestBottleneck.top_reviewer_share || 0}
              reviewerCount={(latestBottleneck.reviewer_breakdown || []).length || 1}
              maxBetweenness={latestBottleneck.max_betweenness_centrality || 0}
              avgLatencyHours={latestBottleneck.avg_review_latency_hours || 0}
            />
          </div>
        </div>
      )}

      {/* ── Velocity Trend Chart (last 30 days) ────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <h3 className="text-sm font-medium mb-4">Deploy Velocity Trend (Last 14 Days)</h3>
        {velocitySnapshots && velocitySnapshots.length > 0 ? (
          <VelocityTrendChart snapshots={velocitySnapshots as any} />
        ) : (
          <EmptyState
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            }
            title="No velocity data yet"
            description="Ingest GitHub pull requests to start tracking deploy velocity trends and collapse predictions."
          />
        )}
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
      <EarlyWarningActions orgId={workspaceId} />
    </div>
  );
}
