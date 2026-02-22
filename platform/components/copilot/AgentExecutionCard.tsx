"use client";

/**
 * AgentExecutionCard — Artifact panel card for completed agent executions.
 *
 * Displays a summary of the agent run with steps, results, and actions taken.
 * Shown in the right-side artifacts panel when an agent completes execution.
 */

import { useState, useCallback } from "react";
import type { AgentStep } from "./types";

interface AgentExecutionData {
  taskId: string;
  agentType: string;
  status: "completed" | "failed" | "running";
  steps: AgentStep[];
  summary?: string;
  artifacts?: Array<{
    id: string;
    type: string;
    title: string;
  }>;
  motorCommands?: Array<{
    action: string;
    status: string;
    response?: unknown;
  }>;
  timing?: {
    totalMs: number;
    stepCount: number;
  };
}

interface AgentExecutionCardProps {
  data: AgentExecutionData;
  className?: string;
  onResume?: (taskId: string) => void;
  onSaveAsAgent?: (data: AgentExecutionData) => void;
}

export function AgentExecutionCard({ data, className = "", onResume, onSaveAsAgent }: AgentExecutionCardProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "steps" | "actions">("summary");
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const completedSteps = data.steps.filter((s) => s.status === "completed").length;
  const failedSteps = data.steps.filter((s) => s.status === "failed").length;

  const canResume = data.status === "failed";

  const handleResume = useCallback(async () => {
    if (!canResume || resuming) return;
    setResuming(true);
    setResumeError(null);

    try {
      if (onResume) {
        onResume(data.taskId);
        return;
      }

      const res = await fetch("/api/agents/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: data.taskId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Resume failed" }));
        setResumeError(err.error || "Resume failed");
      }
    } catch {
      setResumeError("Network error — could not resume");
    } finally {
      setResuming(false);
    }
  }, [canResume, resuming, data.taskId, onResume]);

  return (
    <div className={`rounded-xl border border-border/50 bg-card overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-muted/5">
        <div className="flex items-center gap-2">
          <span className="text-sm">
            {data.status === "completed" ? "\u2705" : data.status === "failed" ? "\u274C" : "\u23F3"}
          </span>
          <span className="text-sm font-medium">
            {data.agentType || "Agent"} Execution
          </span>
        </div>
        <div className="flex items-center gap-2">
          {data.timing && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {(data.timing.totalMs / 1000).toFixed(1)}s
            </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            data.status === "completed" ? "bg-success/10 text-success" :
            data.status === "failed" ? "bg-danger/10 text-danger" :
            "bg-accent/10 text-accent"
          }`}>
            {data.status}
          </span>
          {canResume && (
            <button
              onClick={handleResume}
              disabled={resuming}
              className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
            >
              {resuming ? "Resuming..." : "Resume"}
            </button>
          )}
          {data.status === "completed" && onSaveAsAgent && (
            <button
              onClick={() => onSaveAsAgent(data)}
              className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              Save as Agent
            </button>
          )}
        </div>
      </div>

      {/* Resume error */}
      {resumeError && (
        <div className="px-4 py-1.5 text-[10px] text-danger bg-danger/5 border-b border-border/20">
          {resumeError}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-border/20">
        {(["summary", "steps", "actions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-xs py-2 font-medium transition-colors ${
              activeTab === tab
                ? "text-accent border-b-2 border-accent"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "summary" ? "Summary" : tab === "steps" ? `Steps (${data.steps.length})` : "Actions"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 max-h-80 overflow-y-auto">
        {activeTab === "summary" && (
          <div className="space-y-3">
            {data.summary && (
              <p className="text-xs text-foreground/80 leading-relaxed">{data.summary}</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg bg-muted/10">
                <div className="text-sm font-semibold text-foreground">{completedSteps}</div>
                <div className="text-[10px] text-muted-foreground">Completed</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/10">
                <div className="text-sm font-semibold text-foreground">{failedSteps}</div>
                <div className="text-[10px] text-muted-foreground">Failed</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/10">
                <div className="text-sm font-semibold text-foreground">
                  {data.motorCommands?.length || 0}
                </div>
                <div className="text-[10px] text-muted-foreground">Actions</div>
              </div>
            </div>
            {data.artifacts && data.artifacts.length > 0 && (
              <div>
                <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Generated Artifacts
                </h4>
                <div className="space-y-1">
                  {data.artifacts.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-xs text-foreground/70 py-1 px-2 rounded bg-muted/5">
                      <span className="text-accent">{"\u2726"}</span>
                      <span className="truncate">{a.title}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground font-mono">{a.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "steps" && (
          <div className="space-y-1">
            {data.steps.map((step) => (
              <div key={step.stepNumber} className="flex items-start gap-2 py-1.5">
                <span className="text-xs mt-0.5">
                  {step.status === "completed" ? "\u2705" : step.status === "failed" ? "\u274C" : "\u23F3"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground/80">{step.title}</span>
                    {step.toolName && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-muted/20 text-muted-foreground font-mono">
                        {step.toolName}
                      </span>
                    )}
                  </div>
                  {step.content && (
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-2">{step.content}</p>
                  )}
                </div>
                {step.durationMs != null && (
                  <span className="text-[10px] text-muted-foreground/40 font-mono flex-shrink-0">
                    {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "actions" && (
          <div className="space-y-2">
            {data.motorCommands && data.motorCommands.length > 0 ? (
              data.motorCommands.map((cmd, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded bg-muted/5">
                  <span className="text-xs">
                    {cmd.status === "executed" ? "\u2705" : cmd.status === "dry_run" ? "\u{1F4DD}" : "\u23F3"}
                  </span>
                  <span className="text-xs font-mono text-foreground/70">{cmd.action}</span>
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
                    cmd.status === "executed" ? "bg-success/10 text-success" :
                    cmd.status === "pending_approval" ? "bg-warning/10 text-warning" :
                    "bg-muted/20 text-muted-foreground"
                  }`}>
                    {cmd.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">No motor commands executed</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
