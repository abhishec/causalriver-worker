"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { CopilotArtifact } from "@/components/copilot/CopilotChat";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgentTask {
  id: string;
  prompt: string;
  agent_type: string;
  status: "pending" | "running" | "awaiting_approval" | "approved" | "rejected" | "completed" | "failed";
  confidence_score: number | null;
  result_summary: string | null;
  result_artifacts: Array<{
    id: string;
    type: string;
    title: string;
    language: string;
    content: string;
    createdAt: number;
  }>;
  result_metadata: Record<string, unknown> | null;
  proposed_action: {
    actionType: string;
    description: string;
    impact: string;
    reversible: boolean;
  } | null;
  user_rating: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  started_at: string | null;
}

interface AgentStep {
  id: string;
  step_number: number;
  step_type: string;
  title: string;
  content: string | null;
  started_at: string;
  completed_at: string | null;
}

interface AgentRunnerProps {
  organizationId: string;
  onArtifact?: (artifact: CopilotArtifact) => void;
  className?: string;
}

// ─── Status display config ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: "Queued", color: "text-muted", bg: "bg-muted/10", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  running: { label: "Running", color: "text-accent", bg: "bg-accent/10", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  awaiting_approval: { label: "Needs Approval", color: "text-warning", bg: "bg-warning/10", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" },
  approved: { label: "Approved", color: "text-success", bg: "bg-success/10", icon: "M5 13l4 4L19 7" },
  rejected: { label: "Rejected", color: "text-danger", bg: "bg-danger/10", icon: "M6 18L18 6M6 6l12 12" },
  completed: { label: "Completed", color: "text-success", bg: "bg-success/10", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  failed: { label: "Failed", color: "text-danger", bg: "bg-danger/10", icon: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
};

const STEP_ICONS: Record<string, string> = {
  reasoning: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  query: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  action: "M13 10V3L4 14h7v7l9-11h-7z",
  artifact: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
  approval_request: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 0 || diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AgentRunner({ organizationId, onArtifact, className }: AgentRunnerProps) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const [promptInput, setPromptInput] = useState("");
  const [view, setView] = useState<"spawn" | "list">("spawn");
  const [approvalNote, setApprovalNote] = useState("");
  const [ratingData, setRatingData] = useState<{ rating: string; correction: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  // Track which artifact IDs have been pushed to co-work to prevent duplication
  const pushedArtifactIdsRef = useRef<Set<string>>(new Set());
  // Keep refs for stable polling callbacks (avoid useEffect dependency churn)
  const selectedTaskRef = useRef(selectedTask);
  selectedTaskRef.current = selectedTask;
  const onArtifactRef = useRef(onArtifact);
  onArtifactRef.current = onArtifact;

  // ── Fetch tasks ──────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    if (!organizationId) return;
    try {
      const res = await fetch(`/api/agents/tasks?organizationId=${organizationId}&limit=20`);
      if (!res.ok) return;
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch { /* silent */ }
  }, [organizationId]);

  // ── Fetch single task + steps ──────────────────────────────────
  const fetchTaskDetail = useCallback(async (taskId: string) => {
    if (!organizationId) return;
    try {
      const res = await fetch(`/api/agents/tasks?organizationId=${organizationId}&taskId=${taskId}`);
      if (!res.ok) return;
      const data = await res.json();
      setSelectedTask(data.task);
      setSteps(data.steps || []);

      // If completed, push NEW artifacts to co-work (deduplicated)
      const cb = onArtifactRef.current;
      if (data.task?.status === "completed" && data.task.result_artifacts?.length && cb) {
        for (const artifact of data.task.result_artifacts) {
          if (!pushedArtifactIdsRef.current.has(artifact.id)) {
            pushedArtifactIdsRef.current.add(artifact.id);
            cb({
              id: artifact.id,
              type: artifact.type || "analysis",
              title: artifact.title,
              language: artifact.language,
              content: artifact.content,
              createdAt: artifact.createdAt || Date.now(),
            });
          }
        }
      }
    } catch { /* silent */ }
  }, [organizationId]);

  // Track whether any tasks are active to decide polling frequency
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // ── Smart polling: fast when active tasks exist, slow when idle ──
  useEffect(() => {
    fetchTasks();

    // Single stable interval — dynamically adjusts behavior based on task state
    const id = setInterval(() => {
      const hasActiveTasks = tasksRef.current.some(
        (t) => t.status === "running" || t.status === "pending" || t.status === "awaiting_approval"
      );

      // Only poll task list every cycle if there are active tasks;
      // otherwise skip to reduce network traffic
      if (hasActiveTasks) {
        fetchTasks();
      }

      const current = selectedTaskRef.current;
      if (current && ["running", "pending"].includes(current.status)) {
        fetchTaskDetail(current.id);
      }
    }, 3000);
    pollRef.current = id;

    return () => {
      clearInterval(id);
      pollRef.current = undefined;
    };
  }, [fetchTasks, fetchTaskDetail]); // stable deps — no selectedTask

  // ── Spawn agent ────────────────────────────────────────────────
  const handleSpawn = useCallback(async () => {
    if (!promptInput.trim() || spawning) return;
    setSpawning(true);

    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptInput.trim(),
          organizationId,
          agentType: detectAgentType(promptInput),
        }),
      });

      const data = await res.json();
      if (data.success && data.taskId) {
        setPromptInput("");
        setView("list");
        // Immediately start polling this task
        await fetchTasks();
        fetchTaskDetail(data.taskId);
      }
    } catch { /* silent */ }
    finally { setSpawning(false); }
  }, [promptInput, organizationId, fetchTasks, fetchTaskDetail, spawning]);

  // ── Approve / Reject ───────────────────────────────────────────
  const handleApproveReject = useCallback(async (action: "approve" | "reject") => {
    if (!selectedTask) return;
    try {
      await fetch("/api/agents/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: selectedTask.id,
          action,
          note: approvalNote || undefined,
        }),
      });
      setApprovalNote("");
      fetchTaskDetail(selectedTask.id);
      fetchTasks();
    } catch { /* silent */ }
  }, [selectedTask, approvalNote, fetchTaskDetail, fetchTasks]);

  // ── Rate ───────────────────────────────────────────────────────
  const handleRate = useCallback(async (rating: string, correction?: string) => {
    if (!selectedTask) return;
    try {
      await fetch("/api/agents/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: selectedTask.id,
          action: "rate",
          rating,
          correction: correction || undefined,
        }),
      });
      setRatingData(null);
      fetchTaskDetail(selectedTask.id);
    } catch { /* silent */ }
  }, [selectedTask, fetchTaskDetail]);

  const runningCount = tasks.filter(t => t.status === "running").length;
  const awaitingCount = tasks.filter(t => t.status === "awaiting_approval").length;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-xs font-medium">Brain Agents</span>
          {runningCount > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[9px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              {runningCount} running
            </span>
          )}
          {awaitingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-warning/10 text-warning text-[9px] font-medium">
              {awaitingCount} needs approval
            </span>
          )}
        </div>
        <div className="flex items-center rounded-lg bg-surface border border-border-subtle p-0.5">
          <button
            onClick={() => { setView("spawn"); setSelectedTask(null); }}
            className={cn(
              "px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors",
              view === "spawn" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-muted-foreground"
            )}
          >
            + New
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors",
              view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-muted-foreground"
            )}
          >
            Tasks ({tasks.length})
          </button>
        </div>
      </div>

      {/* ── Spawn View ──────────────────────────────────────────── */}
      {view === "spawn" && !selectedTask && (
        <div className="flex-1 flex flex-col px-4 py-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold mb-0.5">Spawn a Brain Agent</h3>
            <p className="text-[11px] text-muted">
              Each agent runs with full L1-L30 brain memory. High-confidence results auto-deliver; lower confidence asks for your approval.
            </p>
          </div>

          {/* Prompt input */}
          <div className="relative mb-3">
            <textarea
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSpawn();
                }
              }}
              placeholder="What should the agent do? e.g. 'Diagnose why churn increased this quarter'"
              className="w-full h-24 px-3 py-2.5 rounded-xl bg-surface border border-border-subtle text-sm placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 resize-none transition-all"
            />
          </div>

          {/* Quick agent types */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {[
              { label: "Diagnose", prompt: "Diagnose the root cause of ", icon: "🔍" },
              { label: "Analyze Impact", prompt: "Analyze the impact of ", icon: "📊" },
              { label: "Build TDD", prompt: "Generate TDD tests for ", icon: "🧪" },
              { label: "Predict", prompt: "Predict what will happen if ", icon: "🔮" },
              { label: "Investigate", prompt: "Investigate why ", icon: "🕵️" },
            ].map((type) => (
              <button
                key={type.label}
                onClick={() => setPromptInput(type.prompt)}
                className="px-2.5 py-1 rounded-full bg-surface border border-border-subtle text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-accent/30 transition-colors"
              >
                {type.icon} {type.label}
              </button>
            ))}
          </div>

          {/* Spawn button */}
          <button
            onClick={handleSpawn}
            disabled={!promptInput.trim() || spawning}
            className={cn(
              "w-full py-2.5 rounded-xl text-xs font-medium transition-all",
              promptInput.trim() && !spawning
                ? "bg-accent text-accent-foreground hover:bg-accent-dark shadow-[var(--shadow-sm)]"
                : "bg-surface text-muted cursor-not-allowed"
            )}
          >
            {spawning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                Spawning agent...
              </span>
            ) : (
              "⚡ Spawn Agent"
            )}
          </button>
        </div>
      )}

      {/* ── Task List View ──────────────────────────────────────── */}
      {view === "list" && !selectedTask && (
        <div className="flex-1 overflow-y-auto">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-accent/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-muted-foreground mb-1">No agents yet</p>
              <p className="text-[11px] text-muted">Spawn your first brain agent to get started</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {tasks.map((task) => {
                const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
                return (
                  <button
                    key={task.id}
                    onClick={() => { setSelectedTask(task); fetchTaskDetail(task.id); }}
                    className="w-full text-left px-3 py-3 rounded-xl hover:bg-surface-hover border border-transparent hover:border-border-subtle transition-all"
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Status icon */}
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5", config.bg)}>
                        {task.status === "running" ? (
                          <div className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                        ) : (
                          <svg className={cn("w-3.5 h-3.5", config.color)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
                          </svg>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate">{task.prompt}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn("text-[10px] font-medium", config.color)}>{config.label}</span>
                          {task.confidence_score !== null && (
                            <span className="text-[10px] text-muted tabular-nums">
                              {(task.confidence_score * 100).toFixed(0)}% conf
                            </span>
                          )}
                          <span className="text-[10px] text-muted/50">{timeAgo(task.created_at)}</span>
                        </div>
                      </div>

                      {/* Attention indicator */}
                      {task.status === "awaiting_approval" && (
                        <span className="w-2 h-2 rounded-full bg-warning animate-pulse shrink-0 mt-2" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Task Detail View ────────────────────────────────────── */}
      {selectedTask && (
        <div className="flex-1 overflow-y-auto">
          {/* Back button + task header */}
          <div className="px-4 py-3 border-b border-border-subtle">
            <button
              onClick={() => setSelectedTask(null)}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-foreground mb-2 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <p className="text-[12px] font-medium mb-1">{selectedTask.prompt}</p>
            <div className="flex items-center gap-2">
              {(() => {
                const c = STATUS_CONFIG[selectedTask.status] || STATUS_CONFIG.pending;
                return (
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium", c.bg, c.color)}>
                    {selectedTask.status === "running" ? (
                      <span className="w-2 h-2 border border-current/30 border-t-current rounded-full animate-spin" />
                    ) : (
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={c.icon} />
                      </svg>
                    )}
                    {c.label}
                  </span>
                );
              })()}
              {selectedTask.confidence_score !== null && (
                <span className="text-[10px] text-muted tabular-nums">
                  {(selectedTask.confidence_score * 100).toFixed(0)}% confidence
                </span>
              )}
            </div>
          </div>

          {/* Steps timeline */}
          {steps.length > 0 && (
            <div className="px-4 py-3">
              <h4 className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2">Agent Steps</h4>
              <div className="space-y-0">
                {steps.map((step, i) => {
                  const iconPath = STEP_ICONS[step.step_type] || STEP_ICONS.reasoning;
                  const isLast = i === steps.length - 1;
                  return (
                    <div key={step.id} className="flex gap-2.5">
                      {/* Timeline line + dot */}
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "w-5 h-5 rounded-md flex items-center justify-center shrink-0",
                          step.step_type === "approval_request" ? "bg-warning/10" :
                          step.step_type === "artifact" ? "bg-accent/10" :
                          "bg-surface"
                        )}>
                          <svg className={cn("w-3 h-3",
                            step.step_type === "approval_request" ? "text-warning" :
                            step.step_type === "artifact" ? "text-accent" :
                            "text-muted"
                          )} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                          </svg>
                        </div>
                        {!isLast && <div className="w-px h-full bg-border-subtle min-h-[12px]" />}
                      </div>

                      <div className="pb-3 min-w-0">
                        <p className="text-[11px] font-medium">{step.title}</p>
                        {step.content && (
                          <p className="text-[10px] text-muted mt-0.5 leading-relaxed">{step.content}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Running indicator */}
          {selectedTask.status === "running" && (
            <div className="px-4 py-3 mx-4 mb-3 rounded-xl bg-accent/5 border border-accent/10">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                <span className="text-[11px] text-accent font-medium">Agent is thinking...</span>
              </div>
            </div>
          )}

          {/* Approval actions */}
          {selectedTask.status === "awaiting_approval" && (
            <div className="px-4 py-3 mx-4 mb-3 rounded-xl bg-warning/5 border border-warning/15">
              <p className="text-[11px] font-medium text-warning mb-2">
                Agent needs your approval
              </p>
              {selectedTask.proposed_action && (
                <p className="text-[10px] text-muted mb-3">{selectedTask.proposed_action.description}</p>
              )}
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Optional note..."
                className="w-full h-12 px-2.5 py-1.5 rounded-lg bg-surface border border-border-subtle text-[11px] placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none mb-2"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleApproveReject("approve")}
                  className="flex-1 py-2 rounded-lg bg-success/10 text-success text-[11px] font-medium hover:bg-success/20 transition-colors"
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => handleApproveReject("reject")}
                  className="flex-1 py-2 rounded-lg bg-danger/10 text-danger text-[11px] font-medium hover:bg-danger/20 transition-colors"
                >
                  ✗ Reject
                </button>
              </div>
            </div>
          )}

          {/* Result summary */}
          {selectedTask.result_summary && ["completed", "awaiting_approval"].includes(selectedTask.status) && (
            <div className="px-4 py-3">
              <h4 className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2">Result Summary</h4>
              <div className="text-[11px] text-muted-foreground bg-surface/50 rounded-lg p-3 leading-relaxed border border-border-subtle">
                {selectedTask.result_summary}
              </div>
            </div>
          )}

          {/* Artifacts */}
          {selectedTask.result_artifacts?.length > 0 && selectedTask.status === "completed" && (
            <div className="px-4 py-3">
              <h4 className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2">
                Artifacts ({selectedTask.result_artifacts.length})
              </h4>
              <div className="space-y-1.5">
                {selectedTask.result_artifacts.map((artifact) => (
                  <button
                    key={artifact.id}
                    onClick={() => {
                      if (onArtifact) {
                        onArtifact({
                          id: artifact.id,
                          type: artifact.type as "code" | "analysis",
                          title: artifact.title,
                          language: artifact.language,
                          content: artifact.content,
                          createdAt: artifact.createdAt,
                        });
                      }
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-surface/50 border border-border-subtle hover:border-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                      </svg>
                      <span className="text-[11px] font-medium truncate flex-1">{artifact.title}</span>
                      {artifact.language && (
                        <span className="text-[9px] text-accent bg-accent/10 px-1.5 py-0.5 rounded uppercase font-medium">{artifact.language}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Feedback / Rating */}
          {selectedTask.status === "completed" && !selectedTask.user_rating && (
            <div className="px-4 py-3 mx-4 mb-3 rounded-xl bg-surface/50 border border-border-subtle">
              <p className="text-[11px] font-medium mb-2">Was this agent helpful?</p>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => handleRate("helpful")}
                  className="flex-1 py-1.5 rounded-lg bg-success/10 text-success text-[10px] font-medium hover:bg-success/20 transition-colors"
                >
                  👍 Helpful
                </button>
                <button
                  onClick={() => handleRate("not_helpful")}
                  className="flex-1 py-1.5 rounded-lg bg-muted/10 text-muted-foreground text-[10px] font-medium hover:bg-muted/20 transition-colors"
                >
                  👎 Not helpful
                </button>
                <button
                  onClick={() => setRatingData({ rating: "incorrect", correction: "" })}
                  className="flex-1 py-1.5 rounded-lg bg-danger/10 text-danger text-[10px] font-medium hover:bg-danger/20 transition-colors"
                >
                  ✗ Incorrect
                </button>
              </div>
              {ratingData && (
                <div>
                  <textarea
                    value={ratingData.correction}
                    onChange={(e) => setRatingData({ ...ratingData, correction: e.target.value })}
                    placeholder="What was wrong? Your correction teaches the Brain..."
                    className="w-full h-16 px-2.5 py-1.5 rounded-lg bg-surface border border-border-subtle text-[11px] placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none mb-2"
                  />
                  <button
                    onClick={() => handleRate(ratingData.rating, ratingData.correction)}
                    className="w-full py-1.5 rounded-lg bg-accent text-accent-foreground text-[10px] font-medium hover:bg-accent-dark transition-colors"
                  >
                    🧠 Teach Brain
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Already rated */}
          {selectedTask.user_rating && (
            <div className="px-4 py-2 mx-4 mb-3 rounded-lg bg-success/5 border border-success/10 text-[10px] text-success">
              ✓ Brain learned from your feedback
            </div>
          )}

          {/* Error */}
          {selectedTask.status === "failed" && selectedTask.error_message && (
            <div className="px-4 py-3 mx-4 mb-3 rounded-xl bg-danger/5 border border-danger/10">
              <p className="text-[11px] font-medium text-danger mb-1">Error</p>
              <p className="text-[10px] text-danger/70 font-mono">{selectedTask.error_message}</p>
            </div>
          )}

          {/* Metadata */}
          {selectedTask.result_metadata && (
            <div className="px-4 py-3 border-t border-border-subtle mt-2">
              <div className="flex items-center gap-4 text-[10px] text-muted">
                {(selectedTask.result_metadata as any).tokensUsed && (
                  <span>{((selectedTask.result_metadata as any).tokensUsed / 1000).toFixed(1)}K tokens</span>
                )}
                {(selectedTask.result_metadata as any).durationMs && (
                  <span>{((selectedTask.result_metadata as any).durationMs / 1000).toFixed(1)}s</span>
                )}
                {(selectedTask.result_metadata as any).costUsd && (
                  <span>${((selectedTask.result_metadata as any).costUsd).toFixed(4)}</span>
                )}
                {(selectedTask.result_metadata as any).autoExecuted !== undefined && (
                  <span>{(selectedTask.result_metadata as any).autoExecuted ? "Auto-executed" : "Required approval"}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Auto-detect agent type from prompt ─────────────────────────────────────

function detectAgentType(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("diagnos") || lower.includes("root cause") || lower.includes("why")) return "diagnose";
  if (lower.includes("impact") || lower.includes("analy")) return "analyze";
  if (lower.includes("tdd") || lower.includes("test") || lower.includes("build")) return "build";
  if (lower.includes("predict") || lower.includes("forecast") || lower.includes("will")) return "predict";
  if (lower.includes("investigat") || lower.includes("find") || lower.includes("search")) return "investigate";
  return "general";
}
