"use client";

/**
 * useBackgroundTasks — Global background job tracker
 *
 * Persists active job IDs to localStorage so they survive page reloads.
 * On mount, fetches current status from /api/jobs/active and resumes SSE
 * streams for any jobs that are still running.
 *
 * Usage:
 *   const { tasks, addTask, cancelTask } = useBackgroundTasks(orgId);
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BackgroundTask {
  jobId: string;
  agentType: "general" | "apex";
  task: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  step?: string | null;
  progress?: number | null;
  elapsedMs?: number;
  result?: Record<string, unknown> | null;
  error?: string | null;
  createdAt: string;
  workerId?: string;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const STORAGE_KEY = "brainos_bg_tasks";

function loadStoredJobIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveStoredJobIds(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota errors
  }
}

function removeStoredJobId(jobId: string) {
  const ids = loadStoredJobIds().filter((id) => id !== jobId);
  saveStoredJobIds(ids);
}

function addStoredJobId(jobId: string) {
  const ids = loadStoredJobIds();
  if (!ids.includes(jobId)) {
    saveStoredJobIds([...ids, jobId]);
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBackgroundTasks(organizationId: string | undefined) {
  const [tasks, setTasks] = useState<Map<string, BackgroundTask>>(new Map());
  const sourcesRef = useRef<Map<string, EventSource>>(new Map());
  const reconnectTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const errorCountsRef = useRef<Map<string, number>>(new Map()); // Track consecutive errors per job
  const mounted = useRef(true);

  // ── Internal: open SSE stream for a job ─────────────────────────────────

  const openStream = useCallback((jobId: string) => {
    if (sourcesRef.current.has(jobId)) return; // already tracking

    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    sourcesRef.current.set(jobId, es);

    es.onmessage = (e) => {
      if (!mounted.current) return;
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

        // Reset error counter on any successful message
        errorCountsRef.current.delete(jobId);

        if (msg.type === "progress") {
          setTasks((prev) => {
            const next = new Map(prev);
            const existing = next.get(jobId);
            if (existing) {
              next.set(jobId, {
                ...existing,
                status: (msg.status as BackgroundTask["status"]) ?? "running",
                step: msg.step ?? null,
                progress: msg.progress ?? null,
                elapsedMs: msg.elapsedMs,
              });
            }
            return next;
          });
        } else if (msg.type === "complete") {
          // Extract label inside updater to avoid stale closure
          let taskLabel = "Agent task";
          setTasks((prev) => {
            const next = new Map(prev);
            const existing = next.get(jobId);
            if (existing) {
              taskLabel = existing.task;
              next.set(jobId, {
                ...existing,
                status: "completed",
                result: msg.result ?? null,
                elapsedMs: msg.elapsedMs,
                step: null,
                progress: null,
              });
            }
            return next;
          });
          removeStoredJobId(jobId);
          es.close();
          sourcesRef.current.delete(jobId);

          // Notify chat to inject result summary (label is fresh from updater above)
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("copilot-inject-and-submit", {
                detail: `My background agent task just completed: "${taskLabel}". Please retrieve and summarize the results with appropriate widgets and visualizations.`,
              }),
            );
          }
        } else if (msg.type === "failed" || msg.type === "cancelled") {
          setTasks((prev) => {
            const next = new Map(prev);
            const existing = next.get(jobId);
            if (existing) {
              next.set(jobId, {
                ...existing,
                status: msg.type === "cancelled" ? "cancelled" : "failed",
                error: msg.type === "failed" ? (msg.error ?? "Agent job failed") : undefined,
                elapsedMs: msg.elapsedMs,
                step: null,
              });
            }
            return next;
          });
          removeStoredJobId(jobId);
          es.close();
          sourcesRef.current.delete(jobId);
        } else if (msg.type === "paused") {
          // Job checkpointed — will resume in a child job
          setTasks((prev) => {
            const next = new Map(prev);
            const existing = next.get(jobId);
            if (existing) {
              next.set(jobId, {
                ...existing,
                status: "running", // still active, just paused
                step: "Checkpointed — resuming…",
                elapsedMs: msg.elapsedMs,
              });
            }
            return next;
          });
          // Keep in localStorage — child job will continue
          es.close();
          sourcesRef.current.delete(jobId);
        } else if (msg.type === "timeout") {
          // Stream hit 12-min SSE limit — reconnect to keep tracking
          es.close();
          sourcesRef.current.delete(jobId);
          // Reconnect after a short delay (tracked for cleanup)
          const timer = setTimeout(() => {
            reconnectTimersRef.current.delete(timer);
            if (mounted.current) {
              openStream(jobId);
            }
          }, 2000);
          reconnectTimersRef.current.add(timer);
        } else if (msg.type === "error") {
          // Non-fatal poll error from server — just log, stream continues
          logger.warn(`[useBackgroundTasks] Server poll error for ${jobId}`);
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      sourcesRef.current.delete(jobId);

      const MAX_ERROR_RETRIES = 3;
      const errorCount = (errorCountsRef.current.get(jobId) ?? 0) + 1;
      errorCountsRef.current.set(jobId, errorCount);

      if (errorCount < MAX_ERROR_RETRIES && mounted.current) {
        // Retry with exponential backoff: 2s, 4s, 8s
        const backoffMs = 2000 * Math.pow(2, errorCount - 1);
        const timer = setTimeout(() => {
          reconnectTimersRef.current.delete(timer);
          if (mounted.current) {
            openStream(jobId);
          }
        }, backoffMs);
        reconnectTimersRef.current.add(timer);
      } else {
        // Exhausted retries — mark as failed
        errorCountsRef.current.delete(jobId);
        if (mounted.current) {
          setTasks((prev) => {
            const next = new Map(prev);
            const existing = next.get(jobId);
            if (existing && (existing.status === "pending" || existing.status === "running")) {
              next.set(jobId, {
                ...existing,
                status: "failed",
                error: "Connection lost after 3 retries",
                step: null,
              });
            }
            return next;
          });
        }
        removeStoredJobId(jobId);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // No deps: reads latest state via setTasks updater pattern; refs are stable

  // ── Public: add a new job (called when copilot emits generalJobQueued) ───

  const addTask = useCallback(
    (job: { jobId: string; agentType: "general" | "apex"; task: string; status: "pending"; createdAt: string; workerId?: string }) => {
      if (!job.jobId) return;
      addStoredJobId(job.jobId);
      setTasks((prev) => {
        const next = new Map(prev);
        next.set(job.jobId, { ...job });
        return next;
      });
      openStream(job.jobId);
    },
    [openStream],
  );

  // ── Public: cancel a job ──────────────────────────────────────────────────

  const cancelTask = useCallback(async (jobId: string) => {
    try {
      await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      setTasks((prev) => {
        const next = new Map(prev);
        const existing = next.get(jobId);
        if (existing) next.set(jobId, { ...existing, status: "cancelled" });
        return next;
      });
      removeStoredJobId(jobId);
      const es = sourcesRef.current.get(jobId);
      if (es) {
        es.close();
        sourcesRef.current.delete(jobId);
      }
    } catch (err) {
      logger.warn("[useBackgroundTasks] cancel failed", err);
    }
  }, []);

  // ── On mount: resume any jobs from localStorage ───────────────────────────

  useEffect(() => {
    mounted.current = true;
    if (!organizationId) return;

    const storedIds = loadStoredJobIds();
    if (storedIds.length === 0) return;

    // Fetch current status for all stored job IDs — 5s timeout guards against hung Lambda (audit M2)
    fetch(`/api/jobs/active?ids=${storedIds.join(",")}`, { signal: AbortSignal.timeout(5_000) })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { jobs?: Array<{ id: string; task_type: string; agent_type: string; status: string; created_at: string }> } | null) => {
        if (!data?.jobs || !mounted.current) return;
        for (const job of data.jobs) {
          const isActive = job.status === "pending" || job.status === "running";
          const task: BackgroundTask = {
            jobId: job.id,
            agentType: (job.agent_type as "general" | "apex") ?? "general",
            task: job.task_type ?? "Background task",
            status: job.status as BackgroundTask["status"],
            createdAt: job.created_at,
          };
          setTasks((prev) => {
            const next = new Map(prev);
            next.set(job.id, task);
            return next;
          });
          if (isActive) {
            openStream(job.id);
          } else {
            removeStoredJobId(job.id);
          }
        }
        // Remove stored IDs for jobs that no longer exist
        const returnedIds = new Set(data.jobs.map((j) => j.id));
        for (const id of storedIds) {
          if (!returnedIds.has(id)) removeStoredJobId(id);
        }
      })
      .catch(() => {
        // Non-critical — ignore on resume failures
      });

    return () => {
      mounted.current = false;
      for (const es of sourcesRef.current.values()) {
        es.close();
      }
      sourcesRef.current.clear();
      // Clear any pending reconnect timers
      for (const timer of reconnectTimersRef.current) {
        clearTimeout(timer);
      }
      reconnectTimersRef.current.clear();
      // Clear error counts — stale counts would cause premature failure on remount
      errorCountsRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  // ── Visibility change: close streams when tab hidden, reopen when visible ─

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        // Tab hidden — close all EventSources to save resources
        for (const es of sourcesRef.current.values()) {
          es.close();
        }
        sourcesRef.current.clear();
      } else {
        // Tab visible — reconnect active jobs using localStorage as the source of truth
        // (avoids calling setTasks updater with side effects, which is a React anti-pattern)
        const storedIds = loadStoredJobIds();
        for (const jobId of storedIds) {
          if (!sourcesRef.current.has(jobId)) {
            openStream(jobId);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-prune terminal tasks after 5 minutes ────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      setTasks((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [jobId, task] of next.entries()) {
          const isTerminal = task.status === "completed" || task.status === "failed" || task.status === "cancelled";
          if (isTerminal) {
            // Remove tasks that have been terminal for 5+ minutes
            const createdMs = new Date(task.createdAt).getTime();
            const age = now - createdMs;
            if (age > 5 * 60 * 1000) {
              next.delete(jobId);
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    }, 60_000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────

  const taskList = Array.from(tasks.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const activeCount = taskList.filter(
    (t) => t.status === "pending" || t.status === "running",
  ).length;

  return { tasks: taskList, activeCount, addTask, cancelTask };
}
