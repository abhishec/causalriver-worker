"use client";

/**
 * AgentLiveMonitor — Real-time AI agent job tracker
 *
 * Shows the last 10 SE-aaS jobs for the current AI worker space with live
 * updates via Supabase Realtime. Updates instantly when new jobs are submitted
 * or existing jobs change status (pending → running → success/error).
 */

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";

interface AgentJob {
  id: string;
  taskType: string;
  status: "pending" | "running" | "success" | "error";
  createdAt: string;
  completedAt: string | null;
  durationMs: number | null;
  hasArtifact: boolean;
}

interface WorkerHealth {
  pendingJobs: number;
  runningJobs: number;
  succeededLast1h: number;
  failedLast1h: number;
  recentJobs: AgentJob[];
}

interface AgentLiveMonitorProps {
  orgId: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  running: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  error: "bg-danger/10 text-danger",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Queued",
  running: "Running",
  success: "Done",
  error: "Failed",
};

const DOMAIN_ICONS: Record<string, string> = {
  "pod-match": "🎯",
  "early-warning": "⚡",
  "scope-creep": "📊",
  "delivery-intelligence": "🔍",
  "pr-review": "🔎",
  "tdd-code-generator": "🧪",
  "tdd": "🧪",
  "incident-diagnosis": "🚨",
  "impact-analysis": "💥",
  "sql-analyzer": "🗄️",
  "test-data-generator": "🎲",
  "design-doc-generator": "📝",
  "codebase-qa": "💬",
  "architecture-extractor": "🏗️",
  "agent-definition": "🤖",
};

function formatDuration(ms: number | null): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function AgentLiveMonitor({ orgId }: AgentLiveMonitorProps) {
  const [health, setHealth] = useState<WorkerHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const resp = await fetch("/api/brain/worker-health");
      if (resp.ok) {
        const data: WorkerHealth = await resp.json();
        setHealth(data);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Supabase Realtime — subscribe to agent_queue changes for this org
  useEffect(() => {
    if (!orgId) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return;

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

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
        () => {
          // Re-fetch on any change to get latest stats + artifact flags
          fetchHealth();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchHealth]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="h-3 w-32 bg-surface-hover rounded animate-pulse" />
          <div className="h-3 w-16 bg-surface-hover rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 bg-surface rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const jobs = health?.recentJobs ?? [];
  const hasRunning = (health?.runningJobs ?? 0) > 0;

  return (
    <div className="rounded-xl border border-border-subtle bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {hasRunning ? (
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-success/60" />
            )}
            <span className="text-xs font-semibold">Agent Monitor</span>
          </div>
          {hasRunning && (
            <span className="text-[10px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
              {health?.runningJobs} running
            </span>
          )}
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-2 text-[10px] text-muted">
          {(health?.pendingJobs ?? 0) > 0 && (
            <span className="bg-warning/10 text-warning px-1.5 py-0.5 rounded font-medium">
              {health?.pendingJobs} queued
            </span>
          )}
          <span className="bg-success/10 text-success px-1.5 py-0.5 rounded font-medium">
            ✓ {health?.succeededLast1h ?? 0}/hr
          </span>
          {(health?.failedLast1h ?? 0) > 0 && (
            <span className="bg-danger/10 text-danger px-1.5 py-0.5 rounded font-medium">
              ✗ {health?.failedLast1h}
            </span>
          )}
        </div>
      </div>

      {/* Job list */}
      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="text-2xl mb-2">🤖</div>
          <p className="text-xs text-muted">No agent tasks yet</p>
          <p className="text-[10px] text-muted/60 mt-0.5">
            Run a query in Copilot to see tasks here
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface hover:bg-surface-hover transition-colors"
            >
              {/* Domain icon */}
              <span className="text-base shrink-0 w-5 text-center">
                {DOMAIN_ICONS[job.taskType] ?? "⚙️"}
              </span>

              {/* Task type */}
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono truncate block">{job.taskType}</span>
                <span className="text-[10px] text-muted">{formatRelativeTime(job.createdAt)}</span>
              </div>

              {/* Duration */}
              {job.durationMs && (
                <span className="text-[10px] text-muted font-mono shrink-0">
                  {formatDuration(job.durationMs)}
                </span>
              )}

              {/* Artifact badge */}
              {job.hasArtifact && job.status === "success" && (
                <span className="text-[9px] font-medium text-brain-training bg-brain-training/10 px-1.5 py-0.5 rounded shrink-0">
                  artifact
                </span>
              )}

              {/* Status badge */}
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${STATUS_STYLES[job.status] ?? "bg-muted/10 text-muted"}`}
              >
                {job.status === "running" ? (
                  <span className="flex items-center gap-1">
                    <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Running
                  </span>
                ) : (
                  STATUS_LABELS[job.status] ?? job.status
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
