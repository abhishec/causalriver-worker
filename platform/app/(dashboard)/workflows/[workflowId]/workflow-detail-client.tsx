"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { WorkflowDefinition, WorkflowRun, WorkflowRunStep } from "@/lib/workflows/types";

interface WorkflowDetailClientProps {
  workflow: WorkflowDefinition;
  runs: WorkflowRun[];
  highlightRunId: string | null;
  workspaceId: string;
  userId: string;
}

function getStatusColor(status: string) {
  switch (status) {
    case "running": return "bg-blue-500";
    case "paused": return "bg-purple-500";
    case "completed": return "bg-emerald-500";
    case "failed": return "bg-red-500";
    case "cancelled": return "bg-gray-500";
    case "skipped": return "bg-amber-500";
    default: return "bg-gray-400";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "running": return "Running";
    case "paused": return "Awaiting Approval";
    case "completed": return "Completed";
    case "failed": return "Failed";
    case "cancelled": return "Cancelled";
    case "pending": return "Pending";
    case "skipped": return "Skipped";
    default: return status;
  }
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

// ── Run Timeline (per-step visual for a single run) ─────────────────────────

function RunTimeline({ runId, steps: initialSteps }: { runId: string; steps: WorkflowRunStep[] }) {
  const [steps, setSteps] = useState(initialSteps);

  useEffect(() => {
    if (initialSteps.length > 0) {
      setSteps(initialSteps);
      return;
    }
    // Load steps for this run
    fetch(`/api/workflow-runs/${runId}`)
      .then(r => r.json())
      .then(data => { if (data.steps) setSteps(data.steps); })
      .catch(() => {});
  }, [runId, initialSteps]);

  if (steps.length === 0) {
    return <div className="text-xs text-muted py-2">Loading steps...</div>;
  }

  // Group by parallel_group for visual display
  const groups: WorkflowRunStep[][] = [];
  let currentGroup: WorkflowRunStep[] = [];
  let currentParallel: string | null = null;

  for (const step of steps) {
    if (step.parallel_group && step.parallel_group === currentParallel) {
      currentGroup.push(step);
    } else {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [step];
      currentParallel = step.parallel_group;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  return (
    <div className="flex items-start gap-2 overflow-x-auto py-2">
      {groups.map((group, gi) => (
        <div key={gi} className="flex items-center gap-2 shrink-0">
          {group.length === 1 ? (
            <StepBadge step={group[0]} />
          ) : (
            <div className="flex flex-col gap-1 border border-purple-500/20 bg-purple-500/5 rounded-lg p-1.5">
              <div className="text-[9px] text-purple-400 font-medium px-1">Parallel</div>
              {group.map(step => (
                <StepBadge key={step.id} step={step} />
              ))}
            </div>
          )}
          {gi < groups.length - 1 && (
            <svg className="w-4 h-4 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

function StepBadge({ step }: { step: WorkflowRunStep }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border",
      step.status === "completed" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" :
      step.status === "running" ? "bg-blue-500/5 border-blue-500/20 text-blue-400" :
      step.status === "failed" ? "bg-red-500/5 border-red-500/20 text-red-400" :
      step.status === "skipped" ? "bg-amber-500/5 border-amber-500/20 text-amber-400" :
      "bg-surface-hover border-border-subtle text-muted-foreground"
    )}>
      <div className={cn("w-1.5 h-1.5 rounded-full", getStatusColor(step.status))} />
      <span className="font-medium">Step {step.step_order}</span>
      {step.duration_ms != null && (
        <span className="text-[10px] opacity-70">{formatDuration(step.duration_ms)}</span>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function WorkflowDetailClient({ workflow, runs, highlightRunId, workspaceId, userId }: WorkflowDetailClientProps) {
  const router = useRouter();
  const [expandedRunId, setExpandedRunId] = useState<string | null>(highlightRunId);
  const [runStepsCache, setRunStepsCache] = useState<Record<string, WorkflowRunStep[]>>({});
  const [isRunning, setIsRunning] = useState(false);

  const runStepsCacheRef = useRef(runStepsCache);
  runStepsCacheRef.current = runStepsCache;

  const loadRunSteps = useCallback(async (runId: string) => {
    if (runStepsCacheRef.current[runId]) return;
    try {
      const res = await fetch(`/api/workflow-runs/${runId}`);
      const data = await res.json();
      if (data.steps) {
        setRunStepsCache(prev => ({ ...prev, [runId]: data.steps }));
      }
    } catch { /* */ }
  }, []);

  useEffect(() => {
    if (expandedRunId) loadRunSteps(expandedRunId);
  }, [expandedRunId, loadRunSteps]);

  async function handleRun() {
    setIsRunning(true);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        router.refresh();
        setExpandedRunId(data.runId);
      }
    } catch { /* */ }
    setIsRunning(false);
  }

  async function handleCancelRun(runId: string) {
    try {
      const res = await fetch(`/api/workflow-runs/${runId}/cancel`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      }
    } catch { /* */ }
  }

  async function handleResumeRun(runId: string) {
    try {
      const res = await fetch(`/api/workflow-runs/${runId}/resume`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      }
    } catch { /* */ }
  }

  const parallelGroups = new Set(
    workflow.steps.filter((s: any) => s.parallel_group).map((s: any) => s.parallel_group)
  );

  const successRate = runs.length > 0
    ? Math.round(runs.filter(r => r.status === "completed").length / runs.length * 100)
    : 0;

  const runsWithDuration = runs.filter(r => r.duration_ms != null && r.duration_ms > 0);
  const avgDuration = runsWithDuration.length > 0
    ? runsWithDuration.reduce((sum, r) => sum + (r.duration_ms || 0), 0) / runsWithDuration.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/workflows")}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-muted-foreground transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{workflow.name}</h1>
            {workflow.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{workflow.description}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {isRunning ? "Starting..." : "Run Workflow"}
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        {[
          { label: "Total Runs", value: String(workflow.total_runs || runs.length), color: "text-foreground" },
          { label: "Success Rate", value: `${successRate}%`, color: successRate >= 80 ? "text-emerald-400" : "text-amber-400" },
          { label: "Avg Duration", value: formatDuration(avgDuration), color: "text-blue-400" },
          { label: "Steps", value: `${workflow.steps.length} (${parallelGroups.size} parallel)`, color: "text-foreground" },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border-subtle rounded-xl px-4 py-3 flex-1">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">{stat.label}</div>
            <div className={cn("text-2xl font-bold", stat.color)}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Step Pipeline Visual */}
      <div className="bg-card border border-border-subtle rounded-xl p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Pipeline</h2>
        <div className="flex items-center gap-2 overflow-x-auto">
          {workflow.steps.map((step: any, i: number) => {
            const isParallel = step.parallel_group;
            const nextStep = workflow.steps[i + 1] as any;
            const sameGroup = isParallel && nextStep?.parallel_group === step.parallel_group;

            return (
              <div key={step.id || i} className="flex items-center gap-2 shrink-0">
                <div className={cn(
                  "px-3 py-2 rounded-lg text-xs font-medium border",
                  isParallel ? "bg-purple-500/5 text-purple-400 border-purple-500/20" : "bg-surface-hover text-foreground border-border-subtle"
                )}>
                  <div>{step.label}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">
                    {step.input_mapping === "merge_parallel" ? "Merge" : step.input_mapping === "original_input" ? "Original" : "Chain"}
                    {step.approval_required && " · Approval"}
                    {step.failure_behavior !== "stop" && ` · ${step.failure_behavior}`}
                  </div>
                </div>
                {i < workflow.steps.length - 1 && !sameGroup && (
                  <svg className="w-4 h-4 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                )}
                {sameGroup && (
                  <span className="text-xs text-purple-400 font-medium">+</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Run History */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Run History</h2>
        {runs.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border-subtle rounded-xl">
            <p className="text-sm text-muted-foreground">No runs yet. Click "Run Workflow" to start.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map(run => {
              const isExpanded = expandedRunId === run.id;
              const isHighlighted = highlightRunId === run.id;

              return (
                <div
                  key={run.id}
                  className={cn(
                    "bg-card border rounded-xl transition-all",
                    isHighlighted ? "border-accent/30 ring-1 ring-accent/10" : "border-border-subtle",
                    isExpanded ? "shadow-sm" : ""
                  )}
                >
                  {/* Run summary row */}
                  <button
                    onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                    className="w-full px-5 py-3 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-2 h-2 rounded-full", getStatusColor(run.status))} />
                      <div>
                        <span className="text-sm font-medium text-foreground">
                          {getStatusLabel(run.status)}
                        </span>
                        <span className="text-xs text-muted ml-2">
                          Step {run.current_step}/{run.total_steps}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDuration(run.duration_ms)}</span>
                      <span>{timeAgo(run.started_at)}</span>
                      {(run.status === "running" || run.status === "pending") && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCancelRun(run.id); }}
                          className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      {run.status === "paused" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleResumeRun(run.id); }}
                          className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                        >
                          Resume
                        </button>
                      )}
                      <svg
                        className={cn("w-4 h-4 transition-transform", isExpanded ? "rotate-180" : "")}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded run detail */}
                  {isExpanded && (
                    <div className="px-5 pb-4 border-t border-border-subtle pt-3">
                      <RunTimeline runId={run.id} steps={runStepsCache[run.id] || []} />
                      {run.error_message && (
                        <div className="mt-2 px-3 py-2 bg-red-500/5 border border-red-500/20 rounded-lg text-xs text-red-400">
                          {run.error_message}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted">
                        <span>ID: {run.id.slice(0, 8)}</span>
                        <span>Source: {run.trigger_source}</span>
                        {run.conversation_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/copilot?c=${run.conversation_id}`);
                            }}
                            className="text-accent hover:underline"
                          >
                            View in Copilot
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
