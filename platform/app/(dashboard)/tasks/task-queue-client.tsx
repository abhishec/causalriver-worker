"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { WorkerMemoryBanner } from "@/components/tasks/WorkerMemoryBanner";
import type { WorkerSummary } from "@/components/tasks/WorkerMemoryBanner";

type TaskStatus = "running" | "pending" | "awaiting_approval" | "completed" | "failed" | "rejected";
type StatusFilter = "all" | TaskStatus;

interface Task {
  id: string;
  prompt: string;
  agent_type: string;
  status: TaskStatus;
  confidence_score: number | null;
  result_summary: string | null;
  result_artifacts: any[];
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  started_at: string | null;
  result_metadata: any;
  proposed_action: any;
  priority?: string | null;
  workflow_run_id?: string | null;
  workflow_step_order?: number | null;
  source?: string | null;
  conversation_id?: string | null;
}

interface Stats {
  running: number;
  pending: number;
  awaiting_approval: number;
  completed: number;
  failed: number;
}

interface TaskQueueClientProps {
  initialTasks: Task[];
  stats: Stats;
  workspaceId: string;
}

function StatCard({ label, value, color, active, onClick }: {
  label: string;
  value: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 px-4 py-3 rounded-xl border transition-all text-left",
        active ? "bg-card border-accent/20 shadow-sm" : "bg-card/50 border-border-subtle hover:border-border"
      )}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">{label}</div>
      <div className={cn("text-2xl font-bold", color)}>{value}</div>
    </button>
  );
}

function getStatusBadge(status: TaskStatus) {
  switch (status) {
    case "running": return { label: "Running", color: "bg-accent/10 text-accent border-accent/20" };
    case "pending": return { label: "Pending", color: "bg-warning/10 text-warning border-warning/20" };
    case "awaiting_approval": return { label: "Approval", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" };
    case "completed": return { label: "Completed", color: "bg-success/10 text-success border-success/20" };
    case "failed": return { label: "Failed", color: "bg-danger/10 text-danger border-danger/20" };
    case "rejected": return { label: "Rejected", color: "bg-danger/10 text-danger border-danger/20" };
    default: return { label: status, color: "bg-gray-500/10 text-gray-400 border-gray-500/20" };
  }
}

function getPriorityBadge(priority: string | null | undefined) {
  switch (priority) {
    case "critical": return { label: "Critical", color: "text-danger" };
    case "high": return { label: "High", color: "text-orange-400" };
    case "medium": return { label: "Medium", color: "text-amber-400" };
    case "low": return { label: "Low", color: "text-gray-400" };
    default: return null;
  }
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TaskQueueClient({ initialTasks, stats, workspaceId }: TaskQueueClientProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [workerMemory, setWorkerMemory] = useState<WorkerSummary[]>([]);

  // Poll for updates every 5s
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [tasksRes, memRes] = await Promise.allSettled([
          fetch(`/api/tasks?limit=50&organizationId=${encodeURIComponent(workspaceId)}`),
          fetch("/api/brain/worker-memory"),
        ]);
        if (tasksRes.status === "fulfilled" && tasksRes.value.ok) {
          const data = await tasksRes.value.json();
          if (data.tasks) setTasks(data.tasks);
        }
        if (memRes.status === "fulfilled" && memRes.value.ok) {
          const memData = await memRes.value.json();
          if (memData.workers) setWorkerMemory(memData.workers);
        }
      } catch {
        // Non-fatal
      }
    };
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return tasks;
    return tasks.filter(t => t.status === statusFilter);
  }, [tasks, statusFilter]);

  // Sort: awaiting_approval first, then running, then by created_at
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const statusOrder: Record<string, number> = {
        awaiting_approval: 0,
        running: 1,
        pending: 2,
        failed: 3,
        completed: 4,
        rejected: 5,
      };
      const aOrder = statusOrder[a.status] ?? 9;
      const bOrder = statusOrder[b.status] ?? 9;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [filtered]);

  const handleApprove = useCallback(async (taskId: string) => {
    setApproving(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/approve`, { method: "POST" });
      if (res.ok) {
        const task = tasks.find(t => t.id === taskId);
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, status: "completed" as TaskStatus } : t
        ));
        // Auto-resume the parent workflow when a workflow step is approved
        if (task?.workflow_run_id) {
          fetch(`/api/workflow-runs/${task.workflow_run_id}/resume`, { method: "POST" }).catch(() => {});
        }
      }
    } catch { /* */ }
    setApproving(null);
  }, [tasks]);

  const handleReject = useCallback(async (taskId: string) => {
    setApproving(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/reject`, { method: "POST" });
      if (res.ok) {
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, status: "rejected" as TaskStatus } : t
        ));
      }
    } catch { /* */ }
    setApproving(null);
  }, []);

  // Compute live stats from current tasks
  const liveStats: Stats = useMemo(() => ({
    running: tasks.filter(t => t.status === "running").length,
    pending: tasks.filter(t => t.status === "pending").length,
    awaiting_approval: tasks.filter(t => t.status === "awaiting_approval").length,
    completed: tasks.filter(t => t.status === "completed").length,
    failed: tasks.filter(t => t.status === "failed").length,
  }), [tasks]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Task Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor and manage all agent tasks</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border-subtle rounded-lg hover:bg-surface-hover hover:text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Worker Memory Banner — shows context usage across all active AI workers */}
      <WorkerMemoryBanner workers={workerMemory} className="mb-1" />

      {/* Stat Cards */}
      <div className="flex gap-3">
        <StatCard
          label="Running"
          value={liveStats.running}
          color="text-accent"
          active={statusFilter === "running"}
          onClick={() => setStatusFilter(statusFilter === "running" ? "all" : "running")}
        />
        <StatCard
          label="Pending"
          value={liveStats.pending}
          color="text-amber-400"
          active={statusFilter === "pending"}
          onClick={() => setStatusFilter(statusFilter === "pending" ? "all" : "pending")}
        />
        <StatCard
          label="Approval"
          value={liveStats.awaiting_approval}
          color="text-purple-400"
          active={statusFilter === "awaiting_approval"}
          onClick={() => setStatusFilter(statusFilter === "awaiting_approval" ? "all" : "awaiting_approval")}
        />
        <StatCard
          label="Completed"
          value={liveStats.completed}
          color="text-emerald-400"
          active={statusFilter === "completed"}
          onClick={() => setStatusFilter(statusFilter === "completed" ? "all" : "completed")}
        />
        <StatCard
          label="Failed"
          value={liveStats.failed}
          color="text-danger"
          active={statusFilter === "failed"}
          onClick={() => setStatusFilter(statusFilter === "failed" ? "all" : "failed")}
        />
      </div>

      {/* Task List */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {statusFilter === "all" ? "No tasks yet" : `No ${statusFilter.replace("_", " ")} tasks`}
          </h3>
          <p className="text-xs text-muted-foreground max-w-xs">
            {statusFilter === "all"
              ? "Run an agent from the copilot or Agent Studio to see tasks here."
              : "Try adjusting your filter to see more tasks."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(task => {
            const badge = getStatusBadge(task.status as TaskStatus);
            const priority = getPriorityBadge(task.priority);
            const isExpanded = expandedTask === task.id;

            return (
              <div key={task.id} className={cn(
                "bg-card border rounded-xl transition-all",
                task.status === "awaiting_approval" ? "border-purple-500/20" : "border-border-subtle",
                isExpanded && "shadow-sm"
              )}>
                {/* Task Row */}
                <button
                  onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  {/* Expand chevron */}
                  <svg className={cn("w-4 h-4 text-muted transition-transform shrink-0", isExpanded && "rotate-90")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>

                  {/* Title + agent */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {(task.prompt ?? "").slice(0, 80)}{(task.prompt ?? "").length > 80 ? "..." : ""}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted">
                        {(task.agent_type ?? "unknown").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                      {task.source && task.source !== "copilot" && (
                        <span className="text-[9px] text-muted/60">via {task.source}</span>
                      )}
                      {task.workflow_run_id && (
                        <span className="text-[9px] text-accent/60">Workflow Step {task.workflow_step_order}</span>
                      )}
                    </div>
                  </div>

                  {/* Priority */}
                  {priority && (
                    <span className={cn("text-[10px] font-medium", priority.color)}>
                      {priority.label}
                    </span>
                  )}

                  {/* Status badge */}
                  <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", badge.color)}>
                    {badge.label}
                  </span>

                  {/* Confidence */}
                  {task.confidence_score != null && (
                    <span className="text-xs font-mono text-muted w-10 text-right">
                      {(task.confidence_score * 100).toFixed(0)}%
                    </span>
                  )}

                  {/* Time */}
                  <span className="text-[10px] text-muted w-16 text-right shrink-0">
                    {timeAgo(task.created_at)}
                  </span>
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border-subtle">
                    <div className="pt-3 space-y-3">
                      {/* Full prompt */}
                      <div>
                        <label className="text-[10px] font-medium text-muted uppercase tracking-wider">Prompt</label>
                        <p className="text-xs text-foreground mt-1">{task.prompt ?? "—"}</p>
                      </div>

                      {/* Result summary */}
                      {task.result_summary && (
                        <div>
                          <label className="text-[10px] font-medium text-muted uppercase tracking-wider">Result</label>
                          <p className="text-xs text-foreground mt-1 whitespace-pre-wrap max-h-48 overflow-y-auto bg-background rounded-lg p-3">
                            {task.result_summary}
                          </p>
                        </div>
                      )}

                      {/* Error */}
                      {task.error_message && (
                        <div className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-lg" role="alert">
                          {task.error_message}
                        </div>
                      )}

                      {/* Metadata */}
                      {task.result_metadata && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-4 text-[10px] text-muted">
                            {task.result_metadata.durationMs && (
                              <span>Duration: {(task.result_metadata.durationMs / 1000).toFixed(1)}s</span>
                            )}
                            {task.result_metadata.tokensUsed && (
                              <span>Tokens: {task.result_metadata.tokensUsed.toLocaleString()}</span>
                            )}
                            {task.result_metadata.model && (
                              <span>Model: {task.result_metadata.model}</span>
                            )}
                            {task.result_metadata.brainCycleDurationMs && (
                              <span>Brain cycle: {(task.result_metadata.brainCycleDurationMs / 1000).toFixed(1)}s</span>
                            )}
                            {task.result_metadata.compositeConfidence != null && (
                              <span>Composite: {(task.result_metadata.compositeConfidence * 100).toFixed(0)}%</span>
                            )}
                          </div>
                          {/* Brain layer contributions */}
                          {task.result_metadata.topLayerContributions && task.result_metadata.topLayerContributions.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              <span className="text-[9px] text-muted/60 mr-1">Brain layers:</span>
                              {task.result_metadata.topLayerContributions.map((lc: string, i: number) => (
                                <span key={i} className="text-[9px] px-1.5 py-0.5 bg-accent/5 text-accent/70 rounded border border-accent/10">
                                  {lc}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Confidence breakdown for approval decisions */}
                      {task.status === "awaiting_approval" && task.confidence_score != null && (
                        <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg px-3 py-2.5">
                          <div className="text-[10px] font-medium text-purple-400 mb-2">Confidence Breakdown</div>
                          <div className="flex items-center gap-3">
                            {/* Confidence bar */}
                            <div className="flex-1">
                              <div className="h-2 bg-purple-500/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-purple-500/60 rounded-full transition-all"
                                  style={{ width: `${Math.min((task.confidence_score || 0) * 100, 100)}%` }}
                                />
                              </div>
                              <div className="flex justify-between mt-1">
                                <span className="text-[9px] text-muted">0%</span>
                                <span className="text-[9px] text-purple-400 font-medium">
                                  {((task.confidence_score || 0) * 100).toFixed(0)}% confidence
                                </span>
                                <span className="text-[9px] text-muted">100%</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-[9px] text-muted mt-1.5">
                            Formula: Claude (40%) + L6-calibration (15%) + L11-robustness (20%) + history (25%)
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-1">
                        {task.status === "awaiting_approval" && (
                          <>
                            <button
                              onClick={() => handleApprove(task.id)}
                              disabled={approving === task.id}
                              className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-xs font-medium rounded-lg hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                            >
                              {approving === task.id ? "..." : "Approve"}
                            </button>
                            <button
                              onClick={() => handleReject(task.id)}
                              disabled={approving === task.id}
                              className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs font-medium rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {task.conversation_id && (
                          <button
                            onClick={() => window.location.href = `/copilot?c=${task.conversation_id}`}
                            className="px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border-subtle rounded-lg hover:bg-surface-hover hover:text-foreground transition-colors"
                          >
                            View in Copilot
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
