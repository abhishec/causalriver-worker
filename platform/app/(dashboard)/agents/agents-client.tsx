"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatValue } from "@/components/ui/StatValue";
import { StatusDot } from "@/components/ui/StatusDot";
import { TabGroup } from "@/components/ui/TabGroup";
import { EmptyState } from "@/components/ui/EmptyState";

// ─── Types ─────────────────────────────────────────────────────

interface UnifiedRun {
  id: string;
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

interface AgentSummary {
  agentType: string;
  totalRuns: number;
  successful: number;
  failed: number;
  successRate: number;
  lastRun: {
    status: string;
    startedAt: string;
    durationMs: number | null;
    errorMessage: string | null;
  } | null;
  avgDurationMs: number | null;
  totalTokens: number;
  nextRun: string | null;
  schedule: string | null;
  enabled: boolean;
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
  totalSignals: number;
  totalDiscoveries: number;
}

interface QueuedTask {
  id: string;
  agent_type: string;
  task_type: string;
  priority: number;
  status: string;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface DashboardData {
  runs: UnifiedRun[];
  stats: Stats;
  agentSummaries: AgentSummary[];
  scheduledJobs: any[];
  queuedTasks: QueuedTask[];
  timeRange: { since: string; hours: number };
}

// ─── Agent Display Config ──────────────────────────────────────

const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  trainer: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  consolidation: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  dmn: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  "cost-agent": { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  "git-trainer": { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
  benchmark: { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/20" },
  federation: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" },
  "org-updater": { bg: "bg-teal-500/10", text: "text-teal-400", border: "border-teal-500/20" },
  "proactive-intelligence": { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
  security: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
  "outcome-resolver": { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/20" },
};

const AGENT_ICONS: Record<string, string> = {
  trainer: "M13 10V3L4 14h7v7l9-11h-7z",
  consolidation: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z",
  dmn: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  "cost-agent": "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  "git-trainer": "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
  benchmark: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  federation: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  "org-updater": "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  "proactive-intelligence": "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  security: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  "outcome-resolver": "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
};

function getAgentColor(agentType: string) {
  for (const [key, colors] of Object.entries(AGENT_COLORS)) {
    if (agentType.toLowerCase().includes(key)) return colors;
  }
  return { bg: "bg-gray-500/10", text: "text-gray-400", border: "border-gray-500/20" };
}

function getAgentIcon(agentType: string) {
  for (const [key, icon] of Object.entries(AGENT_ICONS)) {
    if (agentType.toLowerCase().includes(key)) return icon;
  }
  return "M4 6h16M4 12h16M4 18h16";
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

// ─── Component ─────────────────────────────────────────────────

export function AgentsClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(72);
  const [view, setView] = useState("overview");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ hours: hours.toString() });
      if (selectedAgent) params.set("agent", selectedAgent);
      const res = await fetch(`/api/agent-runs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [hours, selectedAgent]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-muted">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          Loading agent runs...
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

  const { stats, agentSummaries, runs } = data;
  const failedRuns = runs.filter((r) => r.status === "failed");

  const tabs = [
    { id: "overview", label: "Agent Overview" },
    { id: "timeline", label: "Run Timeline" },
    { id: "errors", label: "Errors", count: failedRuns.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agent Runs</h1>
          <p className="text-xs text-muted mt-0.5">
            {stats.total} runs in the last {hours}h · {stats.successRate}% success rate
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border-subtle overflow-hidden">
            {[24, 72, 168].map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  hours === h
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:text-foreground hover:bg-surface"
                )}
              >
                {h === 24 ? "24h" : h === 72 ? "3d" : "7d"}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            className={cn("p-2 rounded-lg border border-border-subtle text-muted hover:text-foreground hover:bg-surface transition-colors", loading && "animate-spin")}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatValue label="Total Runs" value={String(stats.total)} />
        <StatValue
          label="Success Rate"
          value={`${stats.successRate}%`}
          change={stats.successRate >= 80 ? "healthy" : stats.successRate >= 50 ? "moderate" : "critical"}
          trend={stats.successRate >= 80 ? "up" : "down"}
        />
        <StatValue label="Failed" value={String(stats.failed)} />
        <StatValue label="Avg Duration" value={formatDuration(stats.avgDurationMs)} />
        <StatValue label="Tokens Used" value={stats.totalTokens > 1000 ? `${(stats.totalTokens / 1000).toFixed(1)}K` : String(stats.totalTokens)} />
        <StatValue label="LLM Cost" value={`$${stats.totalCost.toFixed(3)}`} />
      </div>

      {/* View Tabs */}
      <TabGroup
        tabs={tabs}
        activeTab={view}
        onChange={setView}
        variant="underline"
      />

      {/* Agent filter chips */}
      {view !== "overview" && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedAgent(null)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              !selectedAgent ? "bg-accent/10 text-accent" : "bg-surface text-muted hover:text-foreground"
            )}
          >
            All Agents
          </button>
          {agentSummaries.map((a) => {
            const colors = getAgentColor(a.agentType);
            return (
              <button
                key={a.agentType}
                onClick={() => setSelectedAgent(selectedAgent === a.agentType ? null : a.agentType)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  selectedAgent === a.agentType
                    ? `${colors.bg} ${colors.text}`
                    : "bg-surface text-muted hover:text-foreground"
                )}
              >
                {a.agentType}
              </button>
            );
          })}
        </div>
      )}

      {/* View Content */}
      {view === "overview" && (
        <AgentOverview
          summaries={agentSummaries}
          onSelectAgent={(a) => {
            setSelectedAgent(a);
            setView("timeline");
          }}
        />
      )}
      {view === "timeline" && (
        <RunTimeline
          runs={runs}
          expandedRun={expandedRun}
          onToggleRun={(id) => setExpandedRun(expandedRun === id ? null : id)}
        />
      )}
      {view === "errors" && <ErrorsView runs={failedRuns} />}

      {/* Queued Tasks */}
      {data.queuedTasks.length > 0 && (
        <Card>
          <CardTitle className="mb-3">Queued Tasks ({data.queuedTasks.length})</CardTitle>
          <div className="space-y-2">
            {data.queuedTasks.slice(0, 10).map((task) => (
              <div key={task.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border-subtle/50 last:border-0">
                <div className="flex items-center gap-2">
                  <StatusDot type={task.status === "success" ? "success" : task.status === "failed" ? "error" : task.status === "running" ? "active" : "inactive"} size="sm" />
                  <span className="font-medium">{task.agent_type}</span>
                  <span className="text-muted">{task.task_type}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="default" size="xs">P{task.priority}</Badge>
                  <Badge variant={task.status === "completed" ? "success" : task.status === "failed" ? "error" : "default"} size="xs">
                    {task.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Sub-Components ────────────────────────────────────────────

function AgentOverview({
  summaries,
  onSelectAgent,
}: {
  summaries: AgentSummary[];
  onSelectAgent: (agent: string) => void;
}) {
  if (summaries.length === 0) {
    return <EmptyState title="No agent runs" description="No agent runs found in this time range" />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {summaries.map((agent) => {
        const colors = getAgentColor(agent.agentType);
        const icon = getAgentIcon(agent.agentType);

        return (
          <Card
            key={agent.agentType}
            variant="interactive"
            onClick={() => onSelectAgent(agent.agentType)}
            className="cursor-pointer"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", colors.bg)}>
                <svg className={cn("w-5 h-5", colors.text)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                </svg>
              </div>
              <div className="flex items-center gap-1.5">
                {agent.lastRun && (
                  <>
                    <StatusDot type={agent.lastRun.status === "success" ? "success" : agent.lastRun.status === "partial" ? "warning" : "error"} size="sm" />
                    <span className={cn("text-[10px] font-medium",
                      agent.lastRun.status === "success" ? "text-success" : agent.lastRun.status === "partial" ? "text-warning" : "text-danger"
                    )}>
                      {agent.lastRun.status}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Name */}
            <h3 className="text-sm font-semibold mb-0.5">{agent.agentType}</h3>
            {agent.schedule && (
              <p className="text-[10px] text-muted font-mono mb-3">{agent.schedule}</p>
            )}

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="text-center">
                <div className="text-lg font-semibold tabular-nums">{agent.totalRuns}</div>
                <div className="text-[10px] text-muted">runs</div>
              </div>
              <div className="text-center">
                <div className={cn("text-lg font-semibold tabular-nums",
                  agent.successRate >= 80 ? "text-success" : agent.successRate >= 50 ? "text-warning" : "text-danger"
                )}>
                  {agent.successRate}%
                </div>
                <div className="text-[10px] text-muted">success</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold tabular-nums">{formatDuration(agent.avgDurationMs)}</div>
                <div className="text-[10px] text-muted">avg</div>
              </div>
            </div>

            {/* Last Run */}
            {agent.lastRun && (
              <div className="px-3 py-2 rounded-lg bg-surface/50 border border-border-subtle mb-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted">Last run</span>
                  <span className="text-muted-foreground">{formatTimeAgo(agent.lastRun.startedAt)}</span>
                </div>
                {agent.lastRun.errorMessage && (
                  <p className="text-[10px] text-danger mt-1 line-clamp-2">{agent.lastRun.errorMessage}</p>
                )}
              </div>
            )}

            {/* Next Run */}
            {agent.nextRun && (
              <div className="px-3 py-2 rounded-lg bg-accent/5 border border-accent/10">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted">Next run</span>
                  <span className="text-accent">{formatTime(agent.nextRun)}</span>
                </div>
              </div>
            )}

            {/* Failed indicator */}
            {agent.failed > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-danger">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                {agent.failed} failed run{agent.failed > 1 ? "s" : ""}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function RunTimeline({
  runs,
  expandedRun,
  onToggleRun,
}: {
  runs: UnifiedRun[];
  expandedRun: string | null;
  onToggleRun: (id: string) => void;
}) {
  if (runs.length === 0) {
    return <EmptyState title="No runs found" description="No runs match the current filter" />;
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-[auto_1fr_100px_100px_80px_100px] gap-4 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted border-b border-border-subtle bg-surface/30">
        <div className="w-3" />
        <div>Agent</div>
        <div>Time</div>
        <div>Duration</div>
        <div>Tokens</div>
        <div>Status</div>
      </div>

      <div className="divide-y divide-border-subtle/50">
        {runs.map((run) => {
          const colors = getAgentColor(run.agentType);
          const isExpanded = expandedRun === run.id;

          return (
            <div key={run.id}>
              <button
                onClick={() => onToggleRun(run.id)}
                className="w-full grid grid-cols-[auto_1fr_100px_100px_80px_100px] gap-4 px-5 py-3 text-xs hover:bg-surface/30 transition-colors text-left items-center"
              >
                <StatusDot type={run.status === "success" ? "success" : run.status === "partial" ? "warning" : "error"} size="sm" />
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("font-medium truncate", colors.text)}>{run.agentType}</span>
                  <span className="text-[10px] text-muted/50 shrink-0">{run.source}</span>
                </div>
                <div className="text-muted truncate">{formatTimeAgo(run.startedAt)}</div>
                <div className="text-muted-foreground font-mono tabular-nums">{formatDuration(run.durationMs)}</div>
                <div className="text-muted font-mono tabular-nums">{run.tokensUsed > 0 ? run.tokensUsed.toLocaleString() : "--"}</div>
                <div>
                  <Badge
                    variant={run.status === "success" ? "success" : run.status === "partial" ? "warning" : "error"}
                    size="xs"
                  >
                    {run.status}
                  </Badge>
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-4 bg-surface/20 border-t border-border-subtle/50">
                  <div className="grid grid-cols-2 gap-4 pt-3">
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
                    {run.signalsGenerated > 0 && (
                      <div>
                        <div className="text-[10px] font-medium text-muted uppercase mb-1">Signals</div>
                        <div className="text-xs">{run.signalsGenerated.toLocaleString()}</div>
                      </div>
                    )}
                    {run.discoveries > 0 && (
                      <div>
                        <div className="text-[10px] font-medium text-muted uppercase mb-1">Discoveries</div>
                        <div className="text-xs">{run.discoveries}</div>
                      </div>
                    )}
                  </div>

                  {run.outputSummary && (
                    <div className="mt-3">
                      <div className="text-[10px] font-medium text-muted uppercase mb-1">Output</div>
                      <div className="text-xs text-muted-foreground bg-surface/50 rounded-lg p-3 font-mono whitespace-pre-wrap">
                        {run.outputSummary}
                      </div>
                    </div>
                  )}

                  {run.errorMessage && (
                    <div className="mt-3">
                      <div className="text-[10px] font-medium text-danger uppercase mb-1">Error</div>
                      <div className="text-xs text-danger/80 bg-danger/5 rounded-lg p-3 font-mono whitespace-pre-wrap border border-danger/10">
                        {run.errorMessage}
                      </div>
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

function ErrorsView({ runs }: { runs: UnifiedRun[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        }
        title="No Errors"
        description="All agent runs completed successfully in this time range"
      />
    );
  }

  const errorGroups = new Map<string, UnifiedRun[]>();
  for (const run of runs) {
    const key = run.errorMessage || "Unknown error";
    const existing = errorGroups.get(key) || [];
    existing.push(run);
    errorGroups.set(key, existing);
  }

  return (
    <div className="space-y-4">
      {Array.from(errorGroups.entries()).map(([errorMsg, errorRuns]) => (
        <div key={errorMsg} className="rounded-xl bg-card border border-danger/20 overflow-hidden">
          <div className="px-5 py-4 bg-danger/5 border-b border-danger/10">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-danger shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span className="text-sm font-semibold text-danger">{errorRuns.length} occurrence{errorRuns.length > 1 ? "s" : ""}</span>
                </div>
                <pre className="text-xs text-danger/80 font-mono whitespace-pre-wrap break-all">{errorMsg}</pre>
              </div>
            </div>
          </div>
          <div className="divide-y divide-border-subtle/50">
            {errorRuns.map((run) => {
              const colors = getAgentColor(run.agentType);
              return (
                <div key={run.id} className="px-5 py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={cn("font-medium", colors.text)}>{run.agentType}</span>
                  </div>
                  <div className="flex items-center gap-4 text-muted">
                    <span>{formatDuration(run.durationMs)}</span>
                    <span>{formatTime(run.startedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
