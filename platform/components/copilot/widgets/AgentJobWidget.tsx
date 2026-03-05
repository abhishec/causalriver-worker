"use client";

/**
 * AgentJobWidget
 * ──────────────
 * Shows real-time progress for a queued general/APEX agent job.
 * Polls /api/jobs/[jobId]/stream via SSE and transitions through states:
 *   PENDING → RUNNING → COMPLETED (shows result) | FAILED (shows error)
 *
 * Rendered automatically when the copilot emits a `generalJobQueued` SSE event.
 *
 * data shape:
 * {
 *   jobId: string,
 *   agentType: "general" | "apex",
 *   task: string,
 *   status: "pending"
 * }
 */

import { useEffect, useState, useCallback } from "react";
import type { WidgetProps } from "./widget-registry";

type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

interface JobProgress {
  status: JobStatus;
  step?: string | number | null;
  phase?: string | null;
  totalSteps?: number | null;
  currentSubtaskGoal?: string | null;
  lastTool?: string | null;
  totalToolCalls?: number | null;
  partialOutput?: string | null;
  heartbeatAge?: number | null;
  progress?: number | null;
  elapsedMs?: number;
  result?: Record<string, unknown> | null;
  error?: string | null;
}

export function AgentJobWidget({ title, data }: WidgetProps) {
  const jobId = String(data.jobId ?? "");
  const agentType = String(data.agentType ?? "general");
  const task = String(data.task ?? title ?? "Agent task");

  const [progress, setProgress] = useState<JobProgress>({ status: "pending" });
  const [streaming, setStreaming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!jobId) return;

    setStreaming(true);
    const evtSource = new EventSource(`/api/jobs/${jobId}/stream`);

    evtSource.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as {
          type?: string;
          status?: string;
          step?: string;
          progress?: number;
          elapsedMs?: number;
          result?: Record<string, unknown>;
          error?: string;
        };

        if (msg.type === "progress") {
          const m = msg as Record<string, unknown>;
          setProgress({
            status: (msg.status as JobStatus) ?? "running",
            step: msg.step ?? null,
            phase: m.phase as string | null ?? null,
            totalSteps: m.totalSteps as number | null ?? null,
            currentSubtaskGoal: m.currentSubtaskGoal as string | null ?? null,
            lastTool: m.lastTool as string | null ?? null,
            totalToolCalls: m.totalToolCalls as number | null ?? null,
            partialOutput: m.partialOutput as string | null ?? null,
            heartbeatAge: m.heartbeatAge as number | null ?? null,
            progress: msg.progress ?? null,
            elapsedMs: msg.elapsedMs,
          });
        } else if (msg.type === "complete") {
          setProgress({
            status: "completed",
            result: msg.result ?? null,
            elapsedMs: msg.elapsedMs,
          });
          setStreaming(false);
          evtSource.close();
        } else if (msg.type === "failed") {
          setProgress({
            status: "failed",
            error: msg.error ?? "Agent job failed",
            elapsedMs: msg.elapsedMs,
          });
          setStreaming(false);
          evtSource.close();
        } else if (msg.type === "progress" && msg.status === "cancelled") {
          setProgress((prev) => ({ ...prev, status: "cancelled" }));
          setStreaming(false);
          evtSource.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    evtSource.onerror = () => {
      setStreaming(false);
      evtSource.close();
    };

    return () => {
      evtSource.close();
      setStreaming(false);
    };
  }, [jobId]);

  const handleCancel = useCallback(async () => {
    if (!jobId || cancelling) return;
    setCancelling(true);
    try {
      await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      setProgress((prev) => ({ ...prev, status: "cancelled" }));
      setStreaming(false);
    } catch {
      // Ignore — widget will reflect state from SSE stream
    } finally {
      setCancelling(false);
    }
  }, [jobId]); // cancelling read via early return guard; setCancelling is stable

  const isActive = progress.status === "pending" || progress.status === "running";
  const elapsedSec = progress.elapsedMs ? Math.round(progress.elapsedMs / 1000) : 0;
  const elapsedLabel = elapsedSec >= 60
    ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
    : elapsedSec > 0 ? `${elapsedSec}s` : null;
  // Heartbeat staleness: warn if worker hasn't reported in > 60s
  const isStale = isActive && progress.heartbeatAge != null && progress.heartbeatAge > 60_000;

  const agentLabel = agentType === "apex" ? "APEX Research Agent" : "General Agent";
  const statusColors: Record<JobStatus, string> = {
    pending: "text-amber-400",
    running: "text-blue-400",
    completed: "text-emerald-400",
    failed: "text-red-400",
    cancelled: "text-muted",
  };

  const output = progress.result?.output as string | undefined;
  const toolCalls = (progress.result?.toolCalls ?? progress.totalToolCalls) as number | undefined;
  const subtasksCompleted = progress.result?.subtasksCompleted as number | undefined;

  const TOOL_LABELS: Record<string, string> = {
    web_search: "Searching web",
    browser_extract: "Reading page",
    browser_screenshot: "Capturing screenshot",
    search_corpus: "Searching knowledge base",
    search_knowledge: "Retrieving structured knowledge",
    keyword_search: "Keyword lookup",
    write_memory: "Saving to memory",
    compress_context: "Compressing context",
  };
  const lastToolLabel = progress.lastTool ? (TOOL_LABELS[progress.lastTool] ?? progress.lastTool) : null;

  return (
    <div className="my-3 rounded-xl border border-border-subtle overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-surface/40 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
            </span>
          )}
          <span className="text-sm font-semibold text-foreground">{agentLabel}</span>
          <span className={`text-xs font-medium capitalize ${statusColors[progress.status]}`}>
            {progress.status}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          {elapsedLabel && <span>{elapsedLabel}</span>}
          {isStale && <span className="text-amber-400 font-medium">⚠ stale</span>}
          {toolCalls !== undefined && <span>{toolCalls} tool calls</span>}
          {subtasksCompleted !== undefined && <span>{subtasksCompleted} subtasks</span>}
          {isActive && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="text-[10px] px-1.5 py-0.5 rounded text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "✕ Cancel"}
            </button>
          )}
        </div>
      </div>

      {/* Task description */}
      <div className="px-4 py-2 border-b border-border-subtle/40">
        <div className="text-[10px] text-muted uppercase tracking-wider font-medium mb-0.5">Task</div>
        <div className="text-sm text-foreground line-clamp-2">{task}</div>
      </div>

      {/* Live activity (running) */}
      {progress.status === "running" && (
        <div className="px-4 py-2 border-b border-border-subtle/40 space-y-1">
          {/* APEX: subtask progress */}
          {progress.phase && progress.totalSteps && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted font-mono">
                Subtask {progress.step}/{progress.totalSteps}
              </span>
              {progress.currentSubtaskGoal && (
                <span className="text-foreground/70 truncate max-w-[240px]">{progress.currentSubtaskGoal}</span>
              )}
            </div>
          )}
          {/* General: turn counter + last tool */}
          {!progress.phase && progress.step !== null && progress.step !== undefined && (
            <span className="text-[10px] text-muted font-mono">Turn {progress.step}</span>
          )}
          {lastToolLabel && (
            <span className="text-xs text-blue-400 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {lastToolLabel}…
            </span>
          )}
          {progress.partialOutput && (
            <div className="mt-1 text-[10px] text-muted/80 font-mono leading-relaxed line-clamp-3 border-l-2 border-border-subtle/60 pl-2">
              {progress.partialOutput}
            </div>
          )}
        </div>
      )}

      {/* Result (completed) */}
      {progress.status === "completed" && output && (
        <div className="px-4 py-3">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Result</div>
          <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
            {output}
          </div>
        </div>
      )}

      {/* Error (failed) */}
      {progress.status === "failed" && (
        <div className="px-4 py-3">
          <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1">Error</div>
          <div className="text-sm text-red-400">{progress.error}</div>
        </div>
      )}

      {/* Pending placeholder */}
      {progress.status === "pending" && (
        <div className="px-4 py-3 text-sm text-muted">
          Job queued — will start within ~2 minutes on the next cron tick.
        </div>
      )}

      {/* Cancelled */}
      {progress.status === "cancelled" && (
        <div className="px-4 py-3 text-sm text-muted">
          Job cancelled.
        </div>
      )}

      {/* Footer: job ID */}
      <div className="px-4 py-1.5 bg-surface/20 border-t border-border-subtle/40 flex items-center justify-between">
        <span className="text-[10px] text-muted font-mono">
          {jobId.slice(0, 8)}...
        </span>
        <a
          href={`/ai-worker`}
          className="text-[10px] text-primary hover:underline"
        >
          View in Dashboard →
        </a>
      </div>
    </div>
  );
}
