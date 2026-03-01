"use client";

import { useState, useEffect, useCallback } from "react";
import { logger } from "@/lib/logger";
import type { ProcessInstance } from "@/app/api/processes/instances/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function formatProcessType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Status badge ──────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: string;
  jobStatus: string | null;
}

function StatusBadge({ status, jobStatus }: StatusBadgeProps) {
  // Derive display status: job_status overrides instance status for HITL
  const isSuspended = jobStatus === "suspended" || jobStatus === "awaiting_approval";

  if (isSuspended) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Awaiting Approval
      </span>
    );
  }

  switch (status) {
    case "running":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          Running
        </span>
      );
    case "completed":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Completed
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          Failed
        </span>
      );
    case "escalated":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
          Escalated
        </span>
      );
    case "paused":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
          Paused
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-muted/20 text-muted-foreground border border-border-subtle">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          {status}
        </span>
      );
  }
}

// ── Summary card ──────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: number;
  accent?: string;
  loading?: boolean;
}

function SummaryCard({ label, value, accent = "text-foreground", loading }: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {loading ? (
        <div className="h-7 w-12 rounded bg-surface-hover animate-pulse" />
      ) : (
        <span className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</span>
      )}
    </div>
  );
}

// ── Action buttons ────────────────────────────────────────────────────────────

interface HitlActionButtonsProps {
  jobId: string;
  onResolved: () => void;
}

function HitlActionButtons({ jobId, onResolved }: HitlActionButtonsProps) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: "approve" | "reject") {
    if (loading) return;
    setLoading(action);
    setError(null);
    const response =
      action === "approve"
        ? "Approved by workspace member"
        : "Rejected by workspace member";
    try {
      const res = await fetch(`/api/agents/${jobId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((data as { error?: string }).error ?? "Request failed");
      }
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-1 items-end">
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleAction("reject")}
          disabled={loading !== null}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading === "reject" ? "Rejecting..." : "Reject"}
        </button>
        <button
          onClick={() => handleAction("approve")}
          disabled={loading !== null}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading === "approve" ? "Approving..." : "Approve"}
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-400" role="alert">{error}</p>
      )}
    </div>
  );
}

// ── Process row ───────────────────────────────────────────────────────────────

interface ProcessRowProps {
  instance: ProcessInstance;
  onResolved: () => void;
}

function ProcessRow({ instance, onResolved }: ProcessRowProps) {
  const isSuspended =
    instance.job_status === "suspended" || instance.job_status === "awaiting_approval";

  return (
    <div className="grid grid-cols-[1fr_140px_160px_120px_100px_auto] items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors border-b border-border-subtle last:border-b-0">
      {/* Process Type */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {formatProcessType(instance.process_type)}
        </p>
        {instance.escalation_question && (
          <p className="text-xs text-amber-400/80 truncate mt-0.5" title={instance.escalation_question}>
            {instance.escalation_question}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
          {instance.agent_job_id.slice(0, 8)}
        </p>
      </div>

      {/* Current State */}
      <div>
        <span className="text-xs font-mono text-foreground/70 bg-surface-hover px-2 py-1 rounded-md border border-border-subtle">
          {instance.current_state}
        </span>
      </div>

      {/* Status */}
      <div>
        <StatusBadge status={instance.status} jobStatus={instance.job_status} />
      </div>

      {/* Started */}
      <div>
        <span className="text-xs text-muted-foreground">{timeAgo(instance.created_at)}</span>
      </div>

      {/* Duration */}
      <div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDuration(instance.duration_ms)}
        </span>
      </div>

      {/* Actions */}
      <div className="min-w-[160px]">
        {isSuspended ? (
          <HitlActionButtons jobId={instance.agent_job_id} onResolved={onResolved} />
        ) : (
          <span className="text-xs text-muted/40">—</span>
        )}
      </div>
    </div>
  );
}

// ── Table header ──────────────────────────────────────────────────────────────

function TableHeader() {
  return (
    <div className="grid grid-cols-[1fr_140px_160px_120px_100px_auto] items-center gap-4 px-4 py-2.5 border-b border-border-subtle bg-surface/50">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Process Type</span>
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Current State</span>
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Started</span>
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Duration</span>
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide min-w-[160px]">Actions</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Counts {
  total: number;
  running: number;
  completed: number;
  awaitingApproval: number;
}

export default function ProcessesClient() {
  const [instances, setInstances] = useState<ProcessInstance[]>([]);
  const [counts, setCounts] = useState<Counts>({ total: 0, running: 0, completed: 0, awaitingApproval: 0 });
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const fetchInstances = useCallback(async () => {
    try {
      const res = await fetch("/api/processes/instances");
      if (!res.ok) {
        logger.warn("[ProcessesClient] fetch failed:", res.status);
        return;
      }
      const data = await res.json() as { instances: ProcessInstance[]; counts: Counts };
      setInstances(data.instances ?? []);
      setCounts(data.counts ?? { total: 0, running: 0, completed: 0, awaitingApproval: 0 });
      setLastRefreshed(new Date());
    } catch (err) {
      logger.warn("[ProcessesClient] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // 5-second auto-refresh for live state
  useEffect(() => {
    const interval = setInterval(fetchInstances, 5000);
    return () => clearInterval(interval);
  }, [fetchInstances]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Process Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Autonomous business process execution
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted/50">
            Updated {lastRefreshed.toLocaleTimeString()} · auto-refreshes every 5s
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Total Processes" value={counts.total} loading={loading} />
        <SummaryCard
          label="Running"
          value={counts.running}
          accent="text-blue-400"
          loading={loading}
        />
        <SummaryCard
          label="Completed"
          value={counts.completed}
          accent="text-emerald-400"
          loading={loading}
        />
        <SummaryCard
          label="Awaiting Approval"
          value={counts.awaitingApproval}
          accent={counts.awaitingApproval > 0 ? "text-amber-400" : "text-foreground"}
          loading={loading}
        />
      </div>

      {/* Process instances table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {(loading || instances.length > 0) && <TableHeader />}

        {loading ? (
          <div className="space-y-0">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 border-b border-border-subtle bg-card animate-pulse last:border-b-0" />
            ))}
          </div>
        ) : instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">No processes yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Process Intelligence will appear here when SE-aaS, AaaS, or PM-aaS jobs include a{" "}
              <code className="text-accent text-[11px]">process_definition</code> in their payload.
            </p>
          </div>
        ) : (
          <div>
            {instances.map((inst) => (
              <ProcessRow
                key={inst.id}
                instance={inst}
                onResolved={fetchInstances}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
