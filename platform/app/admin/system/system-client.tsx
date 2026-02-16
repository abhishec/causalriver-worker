"use client";

import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";

interface ServiceHealth {
  name: string;
  healthy: boolean;
  detail: string;
}

interface EnvCheck {
  name: string;
  set: boolean;
}

interface ScheduledJob {
  id: string;
  type: string;
  schedule: string;
  lastRun: string | null;
  nextRun: string | null;
  status: string;
}

interface ConsolidationRun {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  packsApplied: number | null;
  edgesDiscovered: number | null;
}

interface AgentRun {
  id: string;
  agentType: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

interface SystemClientProps {
  services: ServiceHealth[];
  envChecks: EnvCheck[];
  scheduledJobs: ScheduledJob[];
  recentConsolidations: ConsolidationRun[];
  recentAgentRuns: AgentRun[];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function SystemClient({
  services,
  envChecks,
  scheduledJobs,
  recentConsolidations,
  recentAgentRuns,
}: SystemClientProps) {
  const allHealthy = services.every((s) => s.healthy);
  const envSetCount = envChecks.filter((e) => e.set).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">System Status</h1>
        <p className="text-xs text-muted mt-0.5">
          Live infrastructure health &middot; Last checked: {new Date().toLocaleTimeString()}
        </p>
      </div>

      {/* Service Health Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {services.map((svc) => (
          <Card key={svc.name}>
            <div className="flex items-center gap-2 mb-1">
              <StatusDot
                type={svc.healthy ? "active" : "error"}
                size="sm"
                pulse={svc.healthy}
              />
              <span className="text-xs font-medium">{svc.name}</span>
            </div>
            <span
              className={`text-[10px] ${
                svc.healthy ? "text-success" : "text-danger"
              }`}
            >
              {svc.healthy ? "Operational" : "Error"}
            </span>
            <p className="text-[10px] text-muted mt-0.5 truncate" title={svc.detail}>
              {svc.detail}
            </p>
          </Card>
        ))}
      </div>

      {/* Overall Status Banner */}
      <Card variant={allHealthy ? "default" : "elevated"}>
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              allHealthy ? "bg-success animate-pulse" : "bg-danger"
            }`}
          />
          <div>
            <p className="text-sm font-medium">
              {allHealthy ? "All systems operational" : "Some systems need attention"}
            </p>
            <p className="text-[10px] text-muted">
              {services.filter((s) => s.healthy).length}/{services.length} services healthy
              &middot; {envSetCount}/{envChecks.length} env vars configured
            </p>
          </div>
        </div>
      </Card>

      {/* Environment Variables */}
      <Card>
        <CardTitle className="mb-4">
          Environment Variables ({envSetCount}/{envChecks.length})
        </CardTitle>
        <div className="space-y-1">
          {envChecks.map((env) => (
            <div
              key={env.name}
              className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface/30 transition-colors"
            >
              <span className="font-mono text-xs text-muted-foreground">{env.name}</span>
              <Badge variant={env.set ? "success" : "danger"} size="xs">
                {env.set ? "Set" : "Missing"}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Scheduled Jobs */}
      <Card>
        <CardTitle className="mb-4">
          Scheduled Jobs ({scheduledJobs.length})
        </CardTitle>
        {scheduledJobs.length === 0 ? (
          <p className="text-xs text-muted py-4 text-center">
            No scheduled jobs found. Jobs are registered when training/consolidation runs.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted border-b border-border-subtle">
                  <th className="text-left py-2 font-medium">Job Type</th>
                  <th className="text-left py-2 font-medium">Schedule</th>
                  <th className="text-left py-2 font-medium">Last Run</th>
                  <th className="text-left py-2 font-medium">Next Run</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {scheduledJobs.map((job) => (
                  <tr key={job.id} className="border-b border-border-subtle/50">
                    <td className="py-2 font-mono text-xs text-accent">{job.type}</td>
                    <td className="py-2 font-mono text-xs text-muted">{job.schedule}</td>
                    <td className="py-2 text-xs">{timeAgo(job.lastRun)}</td>
                    <td className="py-2 text-xs">{timeAgo(job.nextRun)}</td>
                    <td className="py-2">
                      <Badge
                        variant={
                          job.status === "active"
                            ? "success"
                            : job.status === "paused"
                            ? "warning"
                            : "outline"
                        }
                        size="xs"
                      >
                        {job.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recent Training Consolidations */}
      <Card>
        <CardTitle className="mb-4">
          Recent Training Runs ({recentConsolidations.length})
        </CardTitle>
        {recentConsolidations.length === 0 ? (
          <p className="text-xs text-muted py-4 text-center">
            No consolidation runs recorded yet. The brain trains on a schedule.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted border-b border-border-subtle">
                  <th className="text-left py-2 font-medium">Started</th>
                  <th className="text-left py-2 font-medium">Duration</th>
                  <th className="text-left py-2 font-medium">Packs</th>
                  <th className="text-left py-2 font-medium">Edges</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentConsolidations.map((run) => {
                  const duration =
                    run.startedAt && run.completedAt
                      ? `${Math.round(
                          (new Date(run.completedAt).getTime() -
                            new Date(run.startedAt).getTime()) /
                            1000
                        )}s`
                      : "Running...";
                  return (
                    <tr key={run.id} className="border-b border-border-subtle/50">
                      <td className="py-2 text-xs">{timeAgo(run.startedAt)}</td>
                      <td className="py-2 text-xs font-mono">{duration}</td>
                      <td className="py-2 text-xs">{run.packsApplied ?? "—"}</td>
                      <td className="py-2 text-xs text-accent">
                        +{run.edgesDiscovered ?? 0}
                      </td>
                      <td className="py-2">
                        <Badge
                          variant={
                            run.status === "completed"
                              ? "success"
                              : run.status === "running"
                              ? "info"
                              : "danger"
                          }
                          size="xs"
                        >
                          {run.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recent Agent Runs */}
      <Card>
        <CardTitle className="mb-4">
          Recent Agent Executions ({recentAgentRuns.length})
        </CardTitle>
        {recentAgentRuns.length === 0 ? (
          <p className="text-xs text-muted py-4 text-center">
            No agent executions recorded yet. Agents run when triggered by the brain or user.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted border-b border-border-subtle">
                  <th className="text-left py-2 font-medium">Agent</th>
                  <th className="text-left py-2 font-medium">Started</th>
                  <th className="text-left py-2 font-medium">Duration</th>
                  <th className="text-left py-2 font-medium">Status</th>
                  <th className="text-left py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {recentAgentRuns.map((run) => {
                  const duration =
                    run.startedAt && run.completedAt
                      ? `${Math.round(
                          (new Date(run.completedAt).getTime() -
                            new Date(run.startedAt).getTime()) /
                            1000
                        )}s`
                      : "—";
                  return (
                    <tr key={run.id} className="border-b border-border-subtle/50">
                      <td className="py-2 font-mono text-xs text-accent">
                        {run.agentType}
                      </td>
                      <td className="py-2 text-xs">{timeAgo(run.startedAt)}</td>
                      <td className="py-2 text-xs font-mono">{duration}</td>
                      <td className="py-2">
                        <Badge
                          variant={
                            run.status === "completed"
                              ? "success"
                              : run.status === "running"
                              ? "info"
                              : "danger"
                          }
                          size="xs"
                        >
                          {run.status}
                        </Badge>
                      </td>
                      <td className="py-2 text-xs text-danger truncate max-w-[200px]">
                        {run.error || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
