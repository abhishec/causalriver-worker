"use client";

/**
 * AgentLiveMonitor — Real-time AI agent job tracker
 *
 * Shows the last 10 agent_queue jobs for the current AI worker space with live
 * updates via Supabase Realtime. Updates instantly when new jobs are submitted
 * or existing jobs change status (pending → running → success/failed).
 *
 * Data sources:
 *   - Initial jobs: direct Supabase client query on agent_queue
 *   - Stats: GET /api/brain/worker-health (refreshed every 30s)
 *   - Live updates: Supabase Realtime postgres_changes on agent_queue
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface AgentQueueRow {
  id: string;
  agent_type: string | null;
  task_type: string | null;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

interface WorkerStats {
  pendingJobs: number;
  runningJobs: number;
  succeededLast1h: number;
  failedLast1h: number;
}

interface AgentLiveMonitorProps {
  orgId: string;
}

/* ── Status config ──────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; classes: string; pulse?: boolean }> = {
  pending:           { label: "Pending",  classes: "bg-zinc-500/10 text-zinc-400" },
  running:           { label: "Running",  classes: "bg-accent/10 text-accent", pulse: true },
  success:           { label: "Done",     classes: "bg-emerald-500/10 text-emerald-400" },
  succeeded:         { label: "Done",     classes: "bg-emerald-500/10 text-emerald-400" },
  failed:            { label: "Failed",   classes: "bg-red-500/10 text-red-400" },
  error:             { label: "Failed",   classes: "bg-red-500/10 text-red-400" },
  awaiting_approval: { label: "Review",   classes: "bg-amber-500/10 text-amber-400" },
  resumed:           { label: "Resumed",  classes: "bg-blue-500/10 text-blue-400" },
};

/* ── Domain icon map ────────────────────────────────────────────────────── */

const DOMAIN_ICONS: Record<string, string> = {
  "pod-match":              "🎯",
  "early-warning":          "⚡",
  "scope-creep":            "📊",
  "delivery-intelligence":  "🔍",
  "pr-review":              "🔎",
  "tdd-code-generator":     "🧪",
  "tdd":                    "🧪",
  "incident-diagnosis":     "🚨",
  "impact-analysis":        "💥",
  "sql-analyzer":           "🗄️",
  "test-data-generator":    "🎲",
  "design-doc-generator":   "📝",
  "codebase-qa":            "💬",
  "architecture-extractor": "🏗️",
  "agent-definition":       "🤖",
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

function getTaskLabel(row: AgentQueueRow): string {
  return row.task_type ?? row.agent_type ?? "agent-task";
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function formatDuration(row: AgentQueueRow): string {
  if (!row.completed_at || !row.started_at) return "";
  const ms = new Date(row.completed_at).getTime() - new Date(row.started_at).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function AgentLiveMonitor({ orgId }: AgentLiveMonitorProps) {
  const [jobs, setJobs] = useState<AgentQueueRow[]>([]);
  const [stats, setStats] = useState<WorkerStats>({
    pendingJobs: 0,
    runningJobs: 0,
    succeededLast1h: 0,
    failedLast1h: 0,
  });
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Fetch stats from worker-health API ────────────────────────────── */
  const fetchStats = useCallback(async () => {
    try {
      // Pass orgId as query param so the server scopes the query to this workspace
      // without relying solely on the workspace cookie (which may not be set).
      const url = orgId
        ? `/api/brain/worker-health?organizationId=${encodeURIComponent(orgId)}`
        : "/api/brain/worker-health";
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        setStats({
          pendingJobs:    data.pendingJobs    ?? 0,
          runningJobs:    data.runningJobs    ?? 0,
          succeededLast1h: data.succeededLast1h ?? 0,
          failedLast1h:   data.failedLast1h   ?? 0,
        });
      }
    } catch {
      // non-critical — stats are supplementary
    }
  }, [orgId]);

  /* ── Initial data load ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("agent_queue")
          .select("id, agent_type, task_type, status, created_at, started_at, completed_at, error_message")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(10);

        if (!cancelled) {
          if (!error && data) {
            setJobs(data as AgentQueueRow[]);
          }
        }
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    fetchStats();

    return () => { cancelled = true; };
  }, [orgId, fetchStats]);

  /* ── Supabase Realtime subscription ─────────────────────────────────── */
  useEffect(() => {
    if (!orgId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`agent-jobs-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_queue",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newRow = payload.new as AgentQueueRow;
            setJobs((prev) => [newRow, ...prev].slice(0, 10));
            // Refresh stats to keep counts accurate
            fetchStats();
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as AgentQueueRow;
            setJobs((prev) =>
              prev.map((j) => (j.id === updated.id ? updated : j))
            );
            fetchStats();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchStats]);

  /* ── 30-second stats poll ─────────────────────────────────────────── */
  useEffect(() => {
    intervalRef.current = setInterval(fetchStats, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStats]);

  /* ── Loading skeleton ───────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="h-3 w-36 bg-surface-hover rounded animate-pulse" />
          <div className="h-3 w-20 bg-surface-hover rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 bg-surface-hover rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 bg-surface-hover rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const hasRunning = stats.runningJobs > 0;

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">

      {/* ── Section header ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        {hasRunning ? (
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-emerald-500/60 shrink-0" />
        )}
        <span className="text-xs font-semibold text-foreground">AI Worker Activity</span>
        {hasRunning && (
          <span className="text-[10px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
            {stats.runningJobs} running
          </span>
        )}
      </div>

      {/* ── Stats chips row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="rounded-lg bg-background/60 border border-border-subtle px-2.5 py-2 text-center">
          <div className="text-sm font-bold text-foreground tabular-nums">{stats.pendingJobs}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Pending</div>
        </div>
        <div className="rounded-lg bg-background/60 border border-border-subtle px-2.5 py-2 text-center">
          <div className={`text-sm font-bold tabular-nums ${hasRunning ? "text-accent" : "text-foreground"}`}>
            {stats.runningJobs}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Running</div>
        </div>
        <div className="rounded-lg bg-background/60 border border-border-subtle px-2.5 py-2 text-center">
          <div className="text-sm font-bold text-emerald-400 tabular-nums">{stats.succeededLast1h}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Done (1h)</div>
        </div>
        <div className="rounded-lg bg-background/60 border border-border-subtle px-2.5 py-2 text-center">
          <div className={`text-sm font-bold tabular-nums ${stats.failedLast1h > 0 ? "text-red-400" : "text-foreground"}`}>
            {stats.failedLast1h}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Failed (1h)</div>
        </div>
      </div>

      {/* ── Job list ─────────────────────────────────────────────────── */}
      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="text-2xl mb-2">🤖</div>
          <p className="text-xs text-muted-foreground">No agent tasks yet — run a query in Copilot to see them here</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {jobs.map((job) => {
            const label = getTaskLabel(job);
            const icon = DOMAIN_ICONS[label] ?? "⚙️";
            const statusCfg = STATUS_CONFIG[job.status] ?? { label: job.status, classes: "bg-zinc-500/10 text-zinc-400" };
            const duration = formatDuration(job);

            return (
              <div
                key={job.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-background/40 border border-border-subtle/50 hover:bg-surface-hover transition-colors"
              >
                {/* Domain icon */}
                <span className="text-base shrink-0 w-5 text-center" aria-hidden="true">
                  {icon}
                </span>

                {/* Task label + time */}
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono truncate block text-foreground">{label}</span>
                  <span className="text-[10px] text-muted-foreground">{formatRelativeTime(job.created_at)}</span>
                </div>

                {/* Duration (only when completed) */}
                {duration && (
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">{duration}</span>
                )}

                {/* Status badge */}
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${statusCfg.classes}`}
                >
                  {statusCfg.pulse ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {statusCfg.label}
                    </span>
                  ) : (
                    statusCfg.label
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
