"use client";

/**
 * BackgroundTaskPanel
 * ───────────────────
 * Persistent floating panel (bottom-right) showing all active + recent agent jobs.
 * Survives page navigation — mounted at cockpit layout level.
 *
 * Features:
 * - Collapsed: shows pulsing badge with active job count
 * - Expanded: task list with status, current step, elapsed time, cancel
 * - On completion: "View Results →" button injects results into copilot chat
 * - Persists across tab reloads via localStorage (useBackgroundTasks)
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWorkspace } from "@/lib/workspace-context";
import { useBackgroundTasks, type BackgroundTask } from "@/lib/use-background-tasks";

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<BackgroundTask["status"], string> = {
  pending: "text-amber-400",
  running: "text-blue-400",
  completed: "text-emerald-400",
  failed: "text-red-400",
  cancelled: "text-muted-foreground",
};

const STATUS_BG: Record<BackgroundTask["status"], string> = {
  pending: "bg-amber-400/10 border-amber-400/20",
  running: "bg-blue-400/10 border-blue-400/20",
  completed: "bg-emerald-400/10 border-emerald-400/20",
  failed: "bg-red-400/10 border-red-400/20",
  cancelled: "bg-surface border-border-subtle",
};

function formatElapsed(ms?: number): string {
  if (!ms) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ── Single task row ───────────────────────────────────────────────────────────

function TaskRow({ task, onCancel }: { task: BackgroundTask; onCancel: (id: string) => void }) {
  const isActive = task.status === "pending" || task.status === "running";
  const label = task.agentType === "apex" ? "APEX Agent" : "General Agent";

  const handleViewResults = () => {
    window.dispatchEvent(
      new CustomEvent("copilot-inject-and-submit", {
        detail: `My background agent task just completed: "${task.task}". Please retrieve and summarize the results with appropriate widgets and visualizations.`,
      }),
    );
  };

  return (
    <div className={`rounded-xl border p-3 ${STATUS_BG[task.status]}`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {isActive && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
            </span>
          )}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted shrink-0">
            {label}
          </span>
          <span className={`text-[10px] font-medium capitalize ${STATUS_COLOR[task.status]} shrink-0`}>
            · {task.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {task.elapsedMs ? (
            <span className="text-[10px] text-muted shrink-0">{formatElapsed(task.elapsedMs)}</span>
          ) : null}
          {isActive && (
            <button
              type="button"
              onClick={() => onCancel(task.jobId)}
              className="text-[10px] text-red-400 hover:text-red-300 transition-colors shrink-0 px-1.5 py-0.5 rounded hover:bg-red-400/10"
              title="Cancel task"
            >
              ✕ Cancel
            </button>
          )}
        </div>
      </div>

      {/* Task description */}
      <p className="text-xs text-foreground leading-relaxed line-clamp-2 mb-1.5">{task.task}</p>

      {/* Current step (running) */}
      {task.status === "running" && task.step && (
        <p className="text-[10px] text-blue-400 truncate mb-1">{task.step}</p>
      )}

      {/* Progress bar */}
      {isActive && task.progress != null && (
        <div className="w-full h-0.5 bg-border-subtle rounded-full overflow-hidden mb-1.5">
          <div
            className="h-full bg-blue-400 transition-all duration-500"
            style={{ width: `${Math.min(100, task.progress)}%` }}
          />
        </div>
      )}

      {/* Completion action */}
      {task.status === "completed" && (
        <button
          type="button"
          onClick={handleViewResults}
          className="mt-1 text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 transition-colors font-medium"
        >
          View Results →
        </button>
      )}

      {/* Error */}
      {task.status === "failed" && task.error && (
        <p className="text-[10px] text-red-400 mt-1 truncate">{task.error}</p>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function BackgroundTaskPanel() {
  const { currentWorkspace } = useWorkspace();
  const { tasks, activeCount, cancelTask } = useBackgroundTasks(currentWorkspace?.id ?? undefined);
  const [expanded, setExpanded] = useState(false);

  // Only show if there are tasks
  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="w-[320px] max-h-[480px] overflow-y-auto rounded-2xl border border-border-subtle bg-background/95 backdrop-blur-md shadow-xl flex flex-col"
          >
            {/* Panel header */}
            <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-md z-10">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">Background Tasks</span>
                {activeCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-400/15 text-blue-400 font-medium">
                    {activeCount} running
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-muted hover:text-foreground transition-colors p-1 rounded hover:bg-surface"
                aria-label="Close panel"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Task list */}
            <div className="p-3 flex flex-col gap-2">
              {tasks.map((task) => (
                <TaskRow key={task.jobId} task={task} onCancel={cancelTask} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button / collapsed badge */}
      <motion.button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-border-subtle bg-background/95 backdrop-blur-md shadow-lg hover:bg-surface transition-colors"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        aria-label="Toggle background tasks"
      >
        {/* Pulsing dot when active */}
        {activeCount > 0 ? (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
          </span>
        ) : (
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
        )}

        <span className="text-xs font-medium text-foreground">
          {activeCount > 0
            ? `${activeCount} task${activeCount > 1 ? "s" : ""} running`
            : `${tasks.length} task${tasks.length > 1 ? "s" : ""} complete`}
        </span>

        {/* Chevron */}
        <svg
          className={`w-3 h-3 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </motion.button>
    </div>
  );
}
