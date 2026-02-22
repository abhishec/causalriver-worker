"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { WorkflowDefinition } from "@/lib/workflows/types";
import { CreateWorkflowModal } from "@/components/workflows/CreateWorkflowModal";

type ServiceFilter = "all" | "seaas" | "aas" | "general" | "cross-service";

interface Run {
  id: string;
  workflow_id: string;
  status: string;
  current_step: number;
  total_steps: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
}

interface WorkflowsClientProps {
  workflows: WorkflowDefinition[];
  recentRuns: Run[];
  stats: { total: number; running: number; completed: number; failed: number };
  workspaceId: string;
  userId: string;
}

function getStatusColor(status: string) {
  switch (status) {
    case "running": return "bg-blue-500";
    case "paused": return "bg-purple-500";
    case "completed": return "bg-emerald-500";
    case "failed": return "bg-red-500";
    default: return "bg-gray-500";
  }
}

export function WorkflowsClient({ workflows, recentRuns, stats, workspaceId, userId }: WorkflowsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [prefillSteps, setPrefillSteps] = useState<string[] | undefined>(undefined);

  // Auto-open create modal when navigated with ?create=true&steps=agent1,agent2
  useEffect(() => {
    if (searchParams?.get("create") === "true") {
      const stepsParam = searchParams?.get("steps") ?? null;
      if (stepsParam) {
        setPrefillSteps(stepsParam.split(",").map(s => s.trim()).filter(Boolean));
      }
      setShowCreateModal(true);
    }
  }, [searchParams]);

  const filtered = useMemo(() => {
    if (serviceFilter === "all") return workflows;
    return workflows.filter(w => w.service_vertical === serviceFilter);
  }, [workflows, serviceFilter]);

  const servicePills: { id: ServiceFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "seaas", label: "SE-aaS" },
    { id: "aas", label: "AAAS" },
    { id: "general", label: "General" },
  ];

  function getRunsForWorkflow(workflowId: string) {
    return recentRuns.filter(r => r.workflow_id === workflowId);
  }

  function getParallelGroupCount(steps: any[]): number {
    const groups = new Set(steps.filter(s => s.parallel_group).map(s => s.parallel_group));
    return groups.size;
  }

  async function handleRunWorkflow(workflow: WorkflowDefinition) {
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/workflows/${workflow.id}?runId=${data.runId}`);
      }
    } catch { /* */ }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">Chain agents into repeatable pipelines</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          + New Workflow
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-foreground" },
          { label: "Running", value: stats.running, color: "text-blue-400" },
          { label: "Completed", value: stats.completed, color: "text-emerald-400" },
          { label: "Failed", value: stats.failed, color: "text-red-400" },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border-subtle rounded-xl px-4 py-3 flex-1">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted mb-1">{stat.label}</div>
            <div className={cn("text-2xl font-bold", stat.color)}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Service Filter */}
      <div className="flex items-center gap-1">
        {servicePills.map(pill => (
          <button
            key={pill.id}
            onClick={() => setServiceFilter(pill.id)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
              serviceFilter === pill.id
                ? "bg-accent/10 text-accent border border-accent/20"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-hover border border-transparent"
            )}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* My Workflows */}
      {filtered.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">My Workflows</h2>
          <div className="space-y-2">
            {filtered.map(workflow => {
              const runs = getRunsForWorkflow(workflow.id);
              const parallelGroups = getParallelGroupCount(workflow.steps);
              const lastRun = runs[0];

              return (
                <div
                  key={workflow.id}
                  className="bg-card border border-border-subtle rounded-xl px-5 py-4 hover:border-border transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-foreground truncate">{workflow.name}</h3>
                          <span className="text-[10px] text-muted px-1.5 py-0.5 bg-surface-hover rounded">
                            {workflow.steps.length} steps{parallelGroups > 0 ? ` (${parallelGroups} parallel)` : ""}
                          </span>
                        </div>
                        {workflow.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{workflow.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      {/* Run stats */}
                      <div className="text-right">
                        <div className="text-[10px] text-muted">
                          {workflow.total_runs} runs
                        </div>
                        {lastRun && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <div className={cn("w-1.5 h-1.5 rounded-full", getStatusColor(lastRun.status))} />
                            <span className="text-[10px] text-muted">
                              {lastRun.status}
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRunWorkflow(workflow)}
                          className="px-3 py-1.5 bg-accent/10 text-accent text-xs font-medium rounded-lg hover:bg-accent/20 transition-colors"
                        >
                          Run
                        </button>
                        <button
                          onClick={() => router.push(`/workflows/${workflow.id}`)}
                          className="px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border-subtle rounded-lg hover:bg-surface-hover hover:text-foreground transition-colors"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Step visualization */}
                  <div className="flex items-center gap-1.5 mt-3 overflow-x-auto">
                    {workflow.steps.map((step: any, i: number) => {
                      const isParallel = step.parallel_group;
                      const nextStep = workflow.steps[i + 1] as any;
                      const sameGroup = isParallel && nextStep?.parallel_group === step.parallel_group;

                      return (
                        <div key={step.id || i} className="flex items-center gap-1.5 shrink-0">
                          <div className={cn(
                            "px-2 py-1 rounded text-[10px] font-medium border",
                            isParallel ? "bg-purple-500/5 text-purple-400 border-purple-500/20" : "bg-surface-hover text-foreground border-border-subtle"
                          )}>
                            {step.label}
                          </div>
                          {i < workflow.steps.length - 1 && !sameGroup && (
                            <svg className="w-3 h-3 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                          )}
                          {sameGroup && (
                            <span className="text-[10px] text-purple-400">+</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1.5">No workflows yet</h3>
          <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
            Chain agents into repeatable pipelines. Start from a template or build your own.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 bg-accent text-white text-xs font-medium rounded-xl hover:bg-accent/90 transition-colors"
          >
            Create Workflow
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateWorkflowModal
          workspaceId={workspaceId}
          prefillSteps={prefillSteps}
          onClose={() => { setShowCreateModal(false); setPrefillSteps(undefined); }}
          onCreated={(workflowId) => {
            setShowCreateModal(false);
            setPrefillSteps(undefined);
            router.push(`/workflows/${workflowId}`);
          }}
        />
      )}
    </div>
  );
}
