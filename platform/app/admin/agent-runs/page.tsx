"use client";

import { useState, useEffect, useCallback } from "react";
import { cn, formatNumber, formatUSD } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatValue } from "@/components/ui/StatValue";
import { StatusDot } from "@/components/ui/StatusDot";
import { TabGroup } from "@/components/ui/TabGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";

export default function AdminAgentRunsPage() {
  return <AdminAgentsClient />;
}

// ─── Types ─────────────────────────────────────────────────────

interface AdminRun {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  isCoreBrain: boolean;
  agentType: string;
  status: "success" | "partial" | "failed";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  tokensUsed: number;
  costUsd: number | null;
  outputSummary: string | null;
  errorMessage: string | null;
  signalsGenerated: number;
  discoveries: number;
  source: string;
}

interface OrgBreakdown {
  orgId: string;
  orgName: string;
  orgSlug: string;
  isCore: boolean;
  totalRuns: number;
  successful: number;
  failed: number;
  successRate: number;
  lastRun: string | null;
}

interface AgentBreakdown {
  agentType: string;
  totalRuns: number;
  successful: number;
  failed: number;
  successRate: number;
  avgDurationMs: number | null;
  orgsActive: number;
  lastRun: { status: string; startedAt: string; errorMessage: string | null } | null;
}

interface Stats {
  total: number;
  successful: number;
  failed: number;
  partial: number;
  successRate: number;
  avgDurationMs: number;
  totalTokens: number;
  totalCost: number;
  uniqueOrgs: number;
  uniqueAgents: number;
}

interface DashboardData {
  runs: AdminRun[];
  stats: Stats;
  byOrg: OrgBreakdown[];
  byAgent: AgentBreakdown[];
  orgs: { id: string; name: string; slug: string; is_core_brain: boolean }[];
  scheduledJobs: any[];
  queuedTasks: any[];
  timeRange: { since: string; hours: number };
}

// ─── Helpers ───────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (!ms) return "--";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

function formatTimeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatTime(date: string): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ─── Main Component ────────────────────────────────────────────

function AdminAgentsClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(72);
  const [view, setView] = useState("by-org");
  const [orgFilter, setOrgFilter] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ hours: hours.toString() });
      if (orgFilter) params.set("org", orgFilter);
      if (agentFilter) params.set("agent", agentFilter);
      const res = await fetch(`/api/admin/agent-runs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [hours, orgFilter, agentFilter]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted">
          <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          Loading platform agent runs...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <EmptyState
        title="Failed to load agent runs"
        description={error}
        action={{ label: "Retry", onClick: fetchData }}
      />
    );
  }

  if (!data) return null;

  const { stats, byOrg, byAgent, runs } = data;
  const failedRuns = runs.filter((r) => r.status === "failed");

  const tabs = [
    { id: "by-org", label: "By Workspace" },
    { id: "by-agent", label: "By Agent Type" },
    { id: "timeline", label: "All Runs" },
    { id: "errors", label: "Errors", count: failedRuns.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agent Runs — Platform Wide</h1>
          <p className="text-xs text-muted mt-0.5">
            {stats.total} runs across {stats.uniqueOrgs} org{stats.uniqueOrgs !== 1 ? "s" : ""} · {stats.uniqueAgents} agent types · {stats.successRate}% success
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border-subtle overflow-hidden">
            {[24, 72, 168].map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={cn("px-3 py-1.5 text-xs font-medium transition-colors", hours === h ? "bg-amber-500/10 text-amber-400" : "text-muted hover:text-foreground")}
              >
                {h === 24 ? "24h" : h === 72 ? "3d" : "7d"}
              </button>
            ))}
          </div>
          <button onClick={fetchData} className={cn("p-2 rounded-lg border border-border-subtle text-muted hover:text-foreground transition-colors", loading && "animate-spin")}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatValue label="Total Runs" value={formatNumber(stats.total)} />
        <StatValue
          label="Success Rate"
          value={`${stats.successRate}%`}
          change={stats.successRate >= 80 ? "healthy" : stats.successRate >= 50 ? "warning" : "critical"}
          trend={stats.successRate >= 80 ? "up" : "down"}
        />
        <StatValue label="Failed" value={formatNumber(stats.failed)} />
        <StatValue label="Workspaces" value={String(stats.uniqueOrgs)} />
        <StatValue label="Agent Types" value={String(stats.uniqueAgents)} />
        <StatValue label="LLM Cost" value={`$${stats.totalCost.toFixed(3)}`} />
      </div>

      {/* View Tabs */}
      <TabGroup
        tabs={tabs}
        activeTab={view}
        onChange={setView}
        variant="underline"
      />

      {/* Org filter (for timeline and errors) */}
      {(view === "timeline" || view === "errors") && data.orgs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setOrgFilter(null); setAgentFilter(null); }}
            className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors", !orgFilter ? "bg-amber-500/10 text-amber-400" : "bg-surface text-muted hover:text-foreground")}
          >
            All Workspaces
          </button>
          {data.orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => setOrgFilter(orgFilter === org.id ? null : org.id)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                orgFilter === org.id
                  ? org.is_core_brain ? "bg-accent/10 text-accent" : "bg-amber-500/10 text-amber-400"
                  : "bg-surface text-muted hover:text-foreground"
              )}
            >
              {org.is_core_brain ? "Core Brain" : org.name}
            </button>
          ))}
        </div>
      )}

      {/* View Content */}
      {view === "by-org" && (
        <OrgView byOrg={byOrg} onSelectOrg={(orgId) => { setOrgFilter(orgId); setView("timeline"); }} />
      )}
      {view === "by-agent" && (
        <AgentView byAgent={byAgent} onSelectAgent={(a) => { setAgentFilter(a); setView("timeline"); }} />
      )}
      {view === "timeline" && (
        <TimelineView runs={runs} expandedRun={expandedRun} onToggleRun={(id) => setExpandedRun(expandedRun === id ? null : id)} />
      )}
      {view === "errors" && <ErrorsView runs={failedRuns} />}

      {/* Scheduled Jobs Summary */}
      {data.scheduledJobs.length > 0 && (
        <Card>
          <CardTitle className="mb-4">Scheduled Jobs ({data.scheduledJobs.length})</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted border-b border-border-subtle">
                  <th className="text-left py-2 px-3">Job</th>
                  <th className="text-left py-2 px-3">Schedule</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-left py-2 px-3">Runs</th>
                  <th className="text-left py-2 px-3">Errors</th>
                  <th className="text-left py-2 px-3">Last Run</th>
                  <th className="text-left py-2 px-3">Next Run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50">
                {data.scheduledJobs.map((job: any) => (
                  <tr key={job.id} className="hover:bg-surface/30">
                    <td className="py-2 px-3 font-medium">{job.job_name}</td>
                    <td className="py-2 px-3 font-mono text-muted">{job.schedule}</td>
                    <td className="py-2 px-3">
                      <Badge variant={job.enabled ? "success" : "default"} size="xs">
                        {job.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-muted">{job.run_count}</td>
                    <td className="py-2 px-3">
                      <span className={job.error_count > 0 ? "text-danger" : "text-muted"}>{job.error_count}</span>
                    </td>
                    <td className="py-2 px-3 text-muted">{job.last_run_at ? formatTimeAgo(job.last_run_at) : "--"}</td>
                    <td className="py-2 px-3 text-muted">{job.next_run_at ? formatTime(job.next_run_at) : "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Sub Components ────────────────────────────────────────────

function OrgView({ byOrg, onSelectOrg }: { byOrg: OrgBreakdown[]; onSelectOrg: (id: string) => void }) {
  if (byOrg.length === 0) {
    return <EmptyState title="No agent runs" description="No agent runs in this time range" />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {byOrg.map((org) => (
        <Card
          key={org.orgId}
          variant="interactive"
          onClick={() => onSelectOrg(org.orgId)}
          className="cursor-pointer"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", org.isCore ? "bg-accent/20" : "bg-surface")}>
                <span className={cn("text-xs font-bold", org.isCore ? "text-accent" : "text-muted")}>{org.orgName.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold">{org.orgName}</h3>
                <p className="text-[10px] text-muted font-mono">{org.orgSlug}</p>
              </div>
            </div>
            {org.isCore && <Badge variant="accent" size="xs">Core</Badge>}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center">
              <div className="text-lg font-semibold tabular-nums">{org.totalRuns}</div>
              <div className="text-[10px] text-muted">runs</div>
            </div>
            <div className="text-center">
              <div className={cn("text-lg font-semibold tabular-nums", org.successRate >= 80 ? "text-success" : org.successRate >= 50 ? "text-warning" : "text-danger")}>
                {org.successRate}%
              </div>
              <div className="text-[10px] text-muted">success</div>
            </div>
            <div className="text-center">
              <div className={cn("text-lg font-semibold tabular-nums", org.failed > 0 ? "text-danger" : "text-success")}>{org.failed}</div>
              <div className="text-[10px] text-muted">failed</div>
            </div>
          </div>

          {org.lastRun && (
            <div className="px-3 py-2 rounded-lg bg-surface/50 border border-border-subtle text-[11px] text-muted">
              Last run: {formatTimeAgo(org.lastRun)}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function AgentView({ byAgent, onSelectAgent }: { byAgent: AgentBreakdown[]; onSelectAgent: (a: string) => void }) {
  if (byAgent.length === 0) {
    return <EmptyState title="No agent runs" description="No agent runs in this time range" />;
  }

  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted border-b border-border-subtle bg-surface/30">
            <th className="text-left py-3 px-5">Agent</th>
            <th className="text-center py-3 px-3">Runs</th>
            <th className="text-center py-3 px-3">Success</th>
            <th className="text-center py-3 px-3">Failed</th>
            <th className="text-center py-3 px-3">Rate</th>
            <th className="text-center py-3 px-3">Avg Duration</th>
            <th className="text-center py-3 px-3">Orgs</th>
            <th className="text-left py-3 px-3">Last Run</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle/50">
          {byAgent.map((agent) => (
            <tr
              key={agent.agentType}
              onClick={() => onSelectAgent(agent.agentType)}
              className="hover:bg-surface/30 cursor-pointer transition-colors"
            >
              <td className="py-3 px-5 font-medium">{agent.agentType}</td>
              <td className="py-3 px-3 text-center tabular-nums">{agent.totalRuns}</td>
              <td className="py-3 px-3 text-center text-success tabular-nums">{agent.successful}</td>
              <td className="py-3 px-3 text-center">
                <span className={agent.failed > 0 ? "text-danger font-medium" : "text-muted"}>{agent.failed}</span>
              </td>
              <td className="py-3 px-3 text-center">
                <Badge
                  variant={agent.successRate >= 80 ? "success" : agent.successRate >= 50 ? "warning" : "danger"}
                  size="xs"
                >
                  {agent.successRate}%
                </Badge>
              </td>
              <td className="py-3 px-3 text-center text-muted font-mono tabular-nums">{formatDuration(agent.avgDurationMs)}</td>
              <td className="py-3 px-3 text-center text-muted">{agent.orgsActive}</td>
              <td className="py-3 px-3">
                {agent.lastRun && (
                  <div className="flex items-center gap-2">
                    <StatusDot type={agent.lastRun.status === "success" ? "success" : agent.lastRun.status === "partial" ? "warning" : "error"} size="sm" />
                    <span className="text-muted">{formatTimeAgo(agent.lastRun.startedAt)}</span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function TimelineView({
  runs,
  expandedRun,
  onToggleRun,
}: {
  runs: AdminRun[];
  expandedRun: string | null;
  onToggleRun: (id: string) => void;
}) {
  if (runs.length === 0) {
    return <EmptyState title="No runs found" description="No runs match the current filters" />;
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-[auto_120px_1fr_100px_100px_100px] gap-3 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted border-b border-border-subtle bg-surface/30">
        <div className="w-3" />
        <div>Workspace</div>
        <div>Agent</div>
        <div>Time</div>
        <div>Duration</div>
        <div>Status</div>
      </div>

      <div className="divide-y divide-border-subtle/50">
        {runs.map((run) => {
          const isExpanded = expandedRun === run.id;
          return (
            <div key={run.id}>
              <button
                onClick={() => onToggleRun(run.id)}
                className="w-full grid grid-cols-[auto_120px_1fr_100px_100px_100px] gap-3 px-5 py-3 text-xs hover:bg-surface/30 transition-colors text-left items-center"
              >
                <StatusDot type={run.status === "success" ? "success" : run.status === "partial" ? "warning" : "error"} size="sm" />
                <div className="flex items-center gap-1.5 min-w-0">
                  {run.isCoreBrain && <Badge variant="accent" size="xs">Core</Badge>}
                  <span className="text-muted truncate">{run.orgSlug}</span>
                </div>
                <div className="font-medium truncate">{run.agentType}</div>
                <div className="text-muted">{formatTimeAgo(run.startedAt)}</div>
                <div className="text-muted font-mono tabular-nums">{formatDuration(run.durationMs)}</div>
                <div>
                  <Badge
                    variant={run.status === "success" ? "success" : run.status === "partial" ? "warning" : "danger"}
                    size="xs"
                  >
                    {run.status}
                  </Badge>
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-4 bg-surface/20 border-t border-border-subtle/50">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3">
                    <div>
                      <div className="text-[10px] font-medium text-muted uppercase mb-1">Workspace</div>
                      <div className="text-xs">{run.orgName} <span className="text-muted">({run.orgSlug})</span></div>
                    </div>
                    <div>
                      <div className="text-[10px] font-medium text-muted uppercase mb-1">Started</div>
                      <div className="text-xs">{formatTime(run.startedAt)}</div>
                    </div>
                    {run.completedAt && (
                      <div>
                        <div className="text-[10px] font-medium text-muted uppercase mb-1">Completed</div>
                        <div className="text-xs">{formatTime(run.completedAt)}</div>
                      </div>
                    )}
                    {run.costUsd !== null && (
                      <div>
                        <div className="text-[10px] font-medium text-muted uppercase mb-1">Cost</div>
                        <div className="text-xs">${run.costUsd.toFixed(4)}</div>
                      </div>
                    )}
                  </div>

                  {run.outputSummary && (
                    <div className="mt-3">
                      <div className="text-[10px] font-medium text-muted uppercase mb-1">Output</div>
                      <div className="text-xs text-muted-foreground bg-surface/50 rounded-lg p-3 font-mono whitespace-pre-wrap">{run.outputSummary}</div>
                    </div>
                  )}

                  {run.errorMessage && (
                    <div className="mt-3">
                      <div className="text-[10px] font-medium text-danger uppercase mb-1">Error</div>
                      <div className="text-xs text-danger/80 bg-danger/5 rounded-lg p-3 font-mono whitespace-pre-wrap border border-danger/10">{run.errorMessage}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ErrorsView({ runs }: { runs: AdminRun[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        }
        title="No Errors"
        description="All agent runs completed successfully"
      />
    );
  }

  const errorGroups = new Map<string, AdminRun[]>();
  for (const run of runs) {
    const key = run.errorMessage || "Unknown error";
    const existing = errorGroups.get(key) || [];
    existing.push(run);
    errorGroups.set(key, existing);
  }

  return (
    <div className="space-y-4">
      {Array.from(errorGroups.entries()).map(([errorMsg, errorRuns]) => {
        const orgNames = [...new Set(errorRuns.map((r) => r.orgSlug))];
        const agentTypes = [...new Set(errorRuns.map((r) => r.agentType))];
        return (
          <div key={errorMsg} className="rounded-xl bg-card border border-danger/20 overflow-hidden">
            <div className="px-5 py-4 bg-danger/5 border-b border-danger/10">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-danger shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-sm font-semibold text-danger">{errorRuns.length} occurrence{errorRuns.length > 1 ? "s" : ""}</span>
                <span className="text-[10px] text-muted">across {orgNames.length} org{orgNames.length > 1 ? "s" : ""}, {agentTypes.length} agent{agentTypes.length > 1 ? "s" : ""}</span>
              </div>
              <pre className="text-xs text-danger/80 font-mono whitespace-pre-wrap break-all">{errorMsg}</pre>
            </div>
            <div className="divide-y divide-border-subtle/50">
              {errorRuns.map((run) => (
                <div key={run.id} className="px-5 py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted">{run.orgSlug}</span>
                    <span className="text-muted/30">/</span>
                    <span className="font-medium">{run.agentType}</span>
                  </div>
                  <span className="text-muted">{formatTime(run.startedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
