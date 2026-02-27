"use client";

/**
 * OrchestratorStatus
 * ==================
 * Displays the current brain readiness and any waiting jobs that are
 * queued pending brain-population completion.
 *
 * Features:
 *  - Brain readiness indicator (empty / populating / ready) with progress dot
 *  - List of waiting jobs with their dependency and estimated wait countdown
 *  - Auto-refreshes every 10 seconds via polling /api/brain/orchestrator
 *  - Collapses to a single-line badge when all jobs are ready or there are no
 *    waiting jobs (so it doesn't clutter the UI)
 *
 * Usage (Copilot sidebar or AgentLiveMonitor footer):
 *   <OrchestratorStatus />
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ── Types mirrored from lib/brain/agent-orchestrator.ts ─────────────────────
// (avoids a server-to-client import of a server-only module)

interface RunningJob {
  id: string;
  taskType: string;
  startedAt: string;
}

interface PendingJob {
  id: string;
  taskType: string;
  createdAt: string;
}

interface WaitingEntry {
  jobId: string;
  dependsOnJobId: string | null;
  dependsOnType: string;
  createdAt: string;
}

interface OrgAgentState {
  runningJobs: RunningJob[];
  pendingJobs: PendingJob[];
  brainPopulationRunning: boolean;
  brainPopulationJobId?: string;
  brainReadiness: "empty" | "populating" | "ready";
  brainSignalCount: number;
  waitingJobs: WaitingEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatEta(estimatedMs: number): string {
  const mins = Math.ceil(estimatedMs / 60_000);
  if (mins <= 0) return "finishing soon";
  return `~${mins}m`;
}

function formatTaskType(t: string): string {
  return t
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

// ── Component ────────────────────────────────────────────────────────────────

export default function OrchestratorStatus() {
  const [state, setState] = useState<OrgAgentState | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const BRAIN_POP_AVG_DURATION_MS = 3 * 60 * 1000;

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/brain/orchestrator", {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.state) {
        setState(data.state as OrgAgentState);
        setLastUpdated(new Date());
      }
    } catch {
      // Silent — polling failure must not crash the UI
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    intervalRef.current = setInterval(fetchState, 10_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchState]);

  // Nothing to show while loading or when everything is normal (no waiting jobs,
  // brain is ready) — collapse to nothing so we don't add noise to the UI.
  if (loading || !state) {
    return null;
  }

  const hasWaiting = state.waitingJobs.length > 0;
  const isPopulating =
    state.brainReadiness === "populating" || state.brainPopulationRunning;
  const isEmpty = state.brainReadiness === "empty";

  // Only render when there's something meaningful to show
  const shouldRender = hasWaiting || isPopulating || isEmpty;
  if (!shouldRender) return null;

  // ── Brain readiness dot color ────────────────────────────────────────────
  const readinessColor =
    state.brainReadiness === "ready"
      ? "bg-green-500"
      : state.brainReadiness === "populating"
      ? "bg-yellow-400 animate-pulse"
      : "bg-gray-400";

  const readinessLabel =
    state.brainReadiness === "ready"
      ? "Ready"
      : state.brainReadiness === "populating"
      ? "Populating"
      : "Empty";

  const readinessDesc =
    state.brainReadiness === "ready"
      ? `${state.brainSignalCount} signals loaded`
      : state.brainReadiness === "populating"
      ? state.brainPopulationRunning
        ? `Loading data... (${state.brainSignalCount} signals so far)`
        : `${state.brainSignalCount} signals — needs more data`
      : "No data loaded yet. Connect GitHub or Jira to populate the brain.";

  // ── Estimate remaining wait for populating jobs ──────────────────────────
  const blockingJob = state.brainPopulationJobId
    ? state.runningJobs.find((j) => j.id === state.brainPopulationJobId)
    : null;

  const elapsed = blockingJob
    ? Date.now() - new Date(blockingJob.startedAt).getTime()
    : 0;
  const remainingMs = Math.max(0, BRAIN_POP_AVG_DURATION_MS - elapsed);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/80 px-4 py-3 text-sm space-y-2">
      {/* Brain readiness header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${readinessColor}`}
            title={readinessLabel}
          />
          <span className="font-semibold text-gray-200">Brain Status</span>
          <span className="text-gray-300 font-normal">{readinessLabel}</span>
        </div>
        {lastUpdated && (
          <span className="text-gray-600 text-xs">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-gray-300 text-xs pl-5">{readinessDesc}</p>

      {/* Brain population in progress — show progress indicator */}
      {isPopulating && state.brainPopulationRunning && (
        <div className="pl-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-yellow-300 text-xs font-medium">
              Brain population in progress
            </span>
            <span className="text-gray-300 text-xs">
              {formatEta(remainingMs)} remaining
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-yellow-400 transition-all duration-1000"
              style={{
                width: `${Math.min(
                  100,
                  Math.round((elapsed / BRAIN_POP_AVG_DURATION_MS) * 100)
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Waiting jobs */}
      {hasWaiting && (
        <div className="pl-5 space-y-1.5">
          <p className="text-gray-300 text-xs font-medium">
            Queued jobs (auto-start when brain is ready):
          </p>
          {state.waitingJobs.map((w) => (
            <div
              key={w.jobId}
              className="flex items-center justify-between bg-gray-800 rounded px-2.5 py-1.5"
            >
              <div className="flex items-center gap-2">
                {/* Pulsing clock icon (SVG) */}
                <svg
                  className="h-3.5 w-3.5 text-yellow-400 animate-spin-slow flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <span className="text-gray-200 text-xs">
                  {formatTaskType(w.dependsOnType || "brain-population")}
                </span>
                <span className="text-gray-500 text-xs">→</span>
                <span className="text-yellow-300 text-xs font-medium">
                  waiting for {formatTaskType(w.dependsOnType)}
                </span>
              </div>
              {isPopulating && (
                <span className="text-gray-300 text-xs">
                  {formatEta(remainingMs)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty brain — call to action */}
      {isEmpty && !isPopulating && (
        <div className="pl-5">
          <p className="text-gray-300 text-xs">
            Connect a data source (GitHub, Jira) to start brain population.
            Queued analyses will auto-start once data is loaded.
          </p>
        </div>
      )}
    </div>
  );
}
