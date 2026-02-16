"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

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

function statusColor(s: string) {
  return s === "success" ? "text-success" : s === "partial" ? "text-warning" : s === "failed" ? "text-danger" : "text-muted";
}

function statusBg(s: string) {
  return s === "success" ? "bg-success/10" : s === "partial" ? "bg-warning/10" : s === "failed" ? "bg-danger/10" : "bg-muted/10";
}

function statusDot(s: string) {
  return s === "success" ? "bg-success" : s === "partial" ? "bg-warning" : s === "failed" ? "bg-danger" : "bg-muted";
}

// ─── Main Component ────────────────────────────────────────────

function AdminAgentsClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(72);
  const [view, setView] = useState<"by-org" | "by-agent" | "timeline" | "errors">("by-org");
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
          <div className="w-5 h-5 border-2 border-danger/30 border-t-danger rounded-full animate-spin" />
          Loading platform agent runs...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-danger mb-2">Failed to load agent runs</p>
          <p className="text-xs text-muted mb-4">{error}</p>
          <button onClick={fetchData} className="px-4 py-2 rounded-lg bg-danger/10 text-danger text-sm hover:bg-danger/20">Retry</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { stats, byOrg, byAgent, runs } = data;
  const failedRuns = runs.filter((r) => r.status === "failed");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Runs — Platform Wide</h1>
          <p className="text-muted text-sm mt-1">
            {stats.total} runs across {stats.uniqueOrgs} org{stats.uniqueOrgs !== 1 ? "s" : ""} &middot; {stats.uniqueAgents} agent types &middot; {stats.successRate}% success
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/50 overflow-hidden">
            {[24, 72, 168].map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={cn("px-3 py-1.5 text-xs font-medium transition-colors", hours === h ? "bg-danger/10 text-danger" : "text-muted hover:text-foreground")}
              >
                {h === 24 ? "24h" : h === 72 ? "3d" : "7d"}
              </button>
            ))}
          </div>
          <button onClick={fetchData} className={cn("p-2 rounded-lg border border-border/50 text-muted hover:text-foreground transition-colors", loading && "animate-spin")}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="Total Runs" value={stats.total} />
        <StatCard label="Success Rate" value={`${stats.successRate}%`} color={stats.successRate >= 80 ? "success" : stats.successRate >= 50 ? "warning" : "danger"} />
        <StatCard label="Failed" value={stats.failed} color={stats.failed > 0 ? "danger" : "success"} />
        <StatCard label="Organizations" value={stats.uniqueOrgs} />
        <StatCard label="Agent Types" value={stats.uniqueAgents} />
        <StatCard label="LLM Cost" value={`$${stats.totalCost.toFixed(3)}`} />
      </div>

      {/* View Tabs */}
      <div className="flex items-center gap-1 border-b border-border/50 pb-px">
        {[
          { id: "by-org" as const, label: "By Organization" },
          { id: "by-agent" as const, label: "By Agent Type" },
          { id: "timeline" as const, label: "All Runs" },
          { id: "errors" as const, label: `Errors (${failedRuns.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              view === tab.id ? "border-danger text-danger" : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Org filter (for timeline and errors) */}
      {(view === "timeline" || view === "errors") && data.orgs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setOrgFilter(null); setAgentFilter(null); }}
            className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors", !orgFilter ? "bg-danger/10 text-danger" : "bg-surface text-muted hover:text-foreground")}
          >
            All Orgs
          </button>
          {data.orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => setOrgFilter(orgFilter === org.id ? null : org.id)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                orgFilter === org.id
                  ? org.is_core_brain ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"
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
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <h3 className="text-sm font-semibold mb-3">Scheduled Jobs ({data.scheduledJobs.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted border-b border-border/50">
                  <th className="text-left py-2 px-3">Job</th>
                  <th className="text-left py-2 px-3">Schedule</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-left py-2 px-3">Runs</th>
                  <th className="text-left py-2 px-3">Errors</th>
                  <th className="text-left py-2 px-3">Last Run</th>
                  <th className="text-left py-2 px-3">Next Run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {data.scheduledJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-surface/30">
                    <td className="py-2 px-3 font-medium">{job.job_name}</td>
                    <td className="py-2 px-3 font-mono text-muted">{job.schedule}</td>
                    <td className="py-2 px-3">
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", job.enabled ? "bg-success/10 text-success" : "bg-muted/10 text-muted")}>
                        {job.enabled ? "Enabled" : "Disabled"}
                      </span>
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
        </div>
      )}
    </div>
  );
}

// ─── Sub Components ────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-xl bg-card border border-border/50 p-4">
      <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={cn("text-xl font-bold",
        color === "success" && "text-success",
        color === "warning" && "text-warning",
        color === "danger" && "text-danger",
        !color && "text-foreground",
      )}>{value}</div>
    </div>
  );
}

function OrgView({ byOrg, onSelectOrg }: { byOrg: OrgBreakdown[]; onSelectOrg: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {byOrg.map((org) => (
        <button
          key={org.orgId}
          onClick={() => onSelectOrg(org.orgId)}
          className="rounded-xl bg-card border border-border/50 p-5 text-left hover:border-border transition-all"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", org.isCore ? "bg-accent/20" : "bg-surface")}>
                <span className={cn("text-xs font-bold", org.isCore ? "text-accent" : "text-muted")}>{org.orgName.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold">{org.orgName}</h3>
                <p className="text-[10px] text-muted">{org.orgSlug}</p>
              </div>
            </div>
            {org.isCore && <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-medium">Core</span>}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center">
              <div className="text-lg font-bold">{org.totalRuns}</div>
              <div className="text-[10px] text-muted">runs</div>
            </div>
            <div className="text-center">
              <div className={cn("text-lg font-bold", org.successRate >= 80 ? "text-success" : org.successRate >= 50 ? "text-warning" : "text-danger")}>
                {org.successRate}%
              </div>
              <div className="text-[10px] text-muted">success</div>
            </div>
            <div className="text-center">
              <div className={cn("text-lg font-bold", org.failed > 0 ? "text-danger" : "text-success")}>{org.failed}</div>
              <div className="text-[10px] text-muted">failed</div>
            </div>
          </div>

          {org.lastRun && (
            <div className="px-3 py-2 rounded-lg bg-surface/50 border border-border/20 text-[11px] text-muted">
              Last run: {formatTimeAgo(org.lastRun)}
            </div>
          )}
        </button>
      ))}
      {byOrg.length === 0 && (
        <div className="col-span-full text-center py-12 text-muted">No agent runs in this time range</div>
      )}
    </div>
  );
}

function AgentView({ byAgent, onSelectAgent }: { byAgent: AgentBreakdown[]; onSelectAgent: (a: string) => void }) {
  return (
    <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted border-b border-border/50 bg-surface/30">
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
        <tbody className="divide-y divide-border/20">
          {byAgent.map((agent) => (
            <tr
              key={agent.agentType}
              onClick={() => onSelectAgent(agent.agentType)}
              className="hover:bg-surface/30 cursor-pointer transition-colors"
            >
              <td className="py-3 px-5 font-medium">{agent.agentType}</td>
              <td className="py-3 px-3 text-center">{agent.totalRuns}</td>
              <td className="py-3 px-3 text-center text-success">{agent.successful}</td>
              <td className="py-3 px-3 text-center">
                <span className={agent.failed > 0 ? "text-danger font-medium" : "text-muted"}>{agent.failed}</span>
              </td>
              <td className="py-3 px-3 text-center">
                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium",
                  agent.successRate >= 80 ? "bg-success/10 text-success" : agent.successRate >= 50 ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"
                )}>
                  {agent.successRate}%
                </span>
              </td>
              <td className="py-3 px-3 text-center text-muted font-mono">{formatDuration(agent.avgDurationMs)}</td>
              <td className="py-3 px-3 text-center text-muted">{agent.orgsActive}</td>
              <td className="py-3 px-3">
                {agent.lastRun && (
                  <div className="flex items-center gap-2">
                    <div className={cn("w-1.5 h-1.5 rounded-full", statusDot(agent.lastRun.status))} />
                    <span className="text-muted">{formatTimeAgo(agent.lastRun.startedAt)}</span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {byAgent.length === 0 && (
        <div className="text-center py-12 text-muted">No agent runs in this time range</div>
      )}
    </div>
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
  return (
    <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
      <div className="grid grid-cols-[auto_120px_1fr_100px_100px_100px] gap-3 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted border-b border-border/50 bg-surface/30">
        <div className="w-3" />
        <div>Organization</div>
        <div>Agent</div>
        <div>Time</div>
        <div>Duration</div>
        <div>Status</div>
      </div>

      <div className="divide-y divide-border/20">
        {runs.map((run) => {
          const isExpanded = expandedRun === run.id;
          return (
            <div key={run.id}>
              <button
                onClick={() => onToggleRun(run.id)}
                className="w-full grid grid-cols-[auto_120px_1fr_100px_100px_100px] gap-3 px-5 py-3 text-xs hover:bg-surface/30 transition-colors text-left items-center"
              >
                <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", statusDot(run.status))} />
                <div className="flex items-center gap-1.5 min-w-0">
                  {run.isCoreBrain && <span className="px-1 py-0.5 rounded bg-accent/10 text-accent text-[9px] font-medium shrink-0">Core</span>}
                  <span className="text-muted truncate">{run.orgSlug}</span>
                </div>
                <div className="font-medium truncate">{run.agentType}</div>
                <div className="text-muted">{formatTimeAgo(run.startedAt)}</div>
                <div className="text-muted font-mono">{formatDuration(run.durationMs)}</div>
                <div>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", statusBg(run.status), statusColor(run.status))}>
                    {run.status}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-4 bg-surface/20 border-t border-border/10">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3">
                    <div>
                      <div className="text-[10px] font-medium text-muted uppercase mb-1">Organization</div>
                      <div className="text-xs">{run.orgName} ({run.orgSlug})</div>
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

        {runs.length === 0 && (
          <div className="text-center py-12 text-muted text-sm">No runs found</div>
        )}
      </div>
    </div>
  );
}

function ErrorsView({ runs }: { runs: AdminRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-xl bg-card border border-border/50 p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold mb-1">No Errors</h3>
        <p className="text-xs text-muted">All agent runs completed successfully</p>
      </div>
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
            <div className="divide-y divide-border/20">
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
