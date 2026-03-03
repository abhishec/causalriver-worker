"use client";

import { useState, useEffect, useCallback } from "react";
import { logger } from "@/lib/logger";
import type { WritebackApproval } from "@/app/api/connectors/writeback/pending/route";

// ─── Connector icon map ───────────────────────────────────────────────────────

const CONNECTOR_ICONS: Record<string, string> = {
  github: "G",
  jira: "J",
  slack: "S",
  linear: "L",
  confluence: "C",
};

const CONNECTOR_COLORS: Record<string, string> = {
  github: "bg-gray-800 text-white",
  jira: "bg-blue-600 text-white",
  slack: "bg-purple-600 text-white",
  linear: "bg-indigo-600 text-white",
  confluence: "bg-blue-500 text-white",
};

function ConnectorBadge({ type }: { type: string }) {
  const icon = CONNECTOR_ICONS[type] ?? type.charAt(0).toUpperCase();
  const color = CONNECTOR_COLORS[type] ?? "bg-muted text-foreground";
  return (
    <div
      className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${color}`}
      title={type}
    >
      {icon}
    </div>
  );
}

// ─── Action summary builder ───────────────────────────────────────────────────

function buildActionSummary(
  connectorType: string,
  actionType: string,
  payload: Record<string, unknown>
): string {
  const action = actionType.replace(/_/g, " ");
  switch (connectorType) {
    case "github":
      if (actionType === "create_pr" || actionType === "create_pull_request") {
        const title = (payload.title as string) || (payload.pr_title as string) || "";
        const repo = (payload.repo as string) || (payload.repository as string) || "";
        return title ? `Create PR: "${title}"${repo ? ` in ${repo}` : ""}` : `Create pull request on GitHub`;
      }
      if (actionType === "create_branch") {
        const branch = (payload.branch as string) || (payload.branch_name as string) || "";
        return branch ? `Create branch: ${branch}` : "Create GitHub branch";
      }
      if (actionType === "create_issue") {
        const title = (payload.title as string) || "";
        return title ? `Create issue: "${title}"` : "Create GitHub issue";
      }
      break;
    case "jira":
      if (actionType === "create_ticket" || actionType === "create_issue") {
        const summary = (payload.summary as string) || (payload.title as string) || "";
        const project = (payload.project as string) || "";
        return summary ? `Create Jira ticket: "${summary}"${project ? ` [${project}]` : ""}` : "Create Jira ticket";
      }
      break;
    case "slack":
      if (actionType === "send_message" || actionType === "post_message") {
        const channel = (payload.channel as string) || "";
        const text = (payload.text as string) || (payload.message as string) || "";
        const preview = text.length > 60 ? text.slice(0, 60) + "..." : text;
        return channel
          ? `Send message to ${channel}${preview ? `: "${preview}"` : ""}`
          : "Send Slack message";
      }
      break;
    case "linear":
      if (actionType === "create_issue") {
        const title = (payload.title as string) || "";
        return title ? `Create Linear issue: "${title}"` : "Create Linear issue";
      }
      break;
  }
  return `${action} on ${connectorType}`;
}

// ─── Time formatter ───────────────────────────────────────────────────────────

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

// ─── Individual approval row ──────────────────────────────────────────────────

function ApprovalRow({
  approval,
  canApprove,
  onAction,
}: {
  approval: WritebackApproval;
  canApprove: boolean;
  onAction: (approvalId: string, action: "approve" | "reject") => Promise<void>;
}) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = buildActionSummary(
    approval.connector_type,
    approval.action_type,
    approval.action_payload
  );

  const agentLabel = approval.requested_by
    ? approval.requested_by.replace(/^domain:/, "").replace(/-/g, " ")
    : "agent";

  async function handleAction(action: "approve" | "reject") {
    if (loading) return;
    setLoading(action);
    setError(null);
    try {
      await onAction(approval.id, action);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setLoading(null);
    }
  }

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover transition-colors">
      <ConnectorBadge type={approval.connector_type} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{summary}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Requested by{" "}
              <span className="font-medium text-foreground capitalize">{agentLabel}</span>
              {" · "}
              <span>{timeAgo(approval.created_at)}</span>
              {approval.job_id && (
                <span className="ml-1 text-muted/60">
                  · Job <span className="font-mono">{approval.job_id.slice(0, 8)}</span>
                </span>
              )}
            </p>
          </div>

          {canApprove && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleAction("reject")}
                disabled={loading !== null}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-danger/30 text-danger hover:bg-danger/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
          )}
        </div>

        {error && (
          <p className="mt-1 text-xs text-danger" role="alert">{error}</p>
        )}

        {/* Payload preview */}
        <details className="mt-2">
          <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
            View full payload
          </summary>
          <pre className="mt-1.5 p-2 rounded-lg bg-background border border-border-subtle text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(approval.action_payload, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

// ─── Process Engine HITL approvals ───────────────────────────────────────────

interface ProcessApprovalJob {
  id: string;
  process_type: string | null;
  escalation_question: string | null;
  status: string;
  created_at: string;
  payload: Record<string, unknown> | null;
}

function formatProcessType(type: string): string {
  return type.replace(/_/g, " ").replace(/\w/g, (c) => c.toUpperCase());
}

function ProcessApprovalRow({
  job,
  onResolved,
}: {
  job: ProcessApprovalJob;
  onResolved: () => void;
}) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processLabel = job.process_type ? formatProcessType(job.process_type) : "Process";
  const question = job.escalation_question ?? "Human approval required";

  async function handleAction(action: "approve" | "reject") {
    if (loading) return;
    setLoading(action);
    setError(null);
    const response =
      action === "approve" ? "Approved by workspace member" : "Rejected by workspace member";
    try {
      const res = await fetch(`/api/agents/${job.id}/resume`, {
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
    <div className="flex items-start gap-4 p-4 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover transition-colors">
      {/* Process type badge */}
      <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
        <svg
          className="w-4 h-4 text-amber-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
          />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{processLabel}</p>
            <p className="text-xs text-amber-400/90 mt-0.5 leading-relaxed">{question}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Suspended{" "}
              <span>{timeAgo(job.created_at)}</span>
              {" · "}
              <span className="font-mono text-muted/60">{job.id.slice(0, 8)}</span>
            </p>
          </div>

          <div className="flex flex-col gap-1 items-end shrink-0">
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
        </div>
      </div>
    </div>
  );
}

function ProcessHitlSection() {
  const [jobs, setJobs] = useState<ProcessApprovalJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/processes/instances");
      if (!res.ok) return;
      const data = await res.json() as { instances: Array<{
        agent_job_id: string;
        process_type: string | null;
        escalation_question: string | null;
        job_status: string | null;
        created_at: string;
        payload?: Record<string, unknown> | null;
      }> };
      // Filter to only suspended/awaiting_approval Process Engine jobs
      const suspended = (data.instances ?? [])
        .filter((i) => i.job_status === "suspended" || i.job_status === "awaiting_approval")
        .map((i) => ({
          id: i.agent_job_id,
          process_type: i.process_type,
          escalation_question: i.escalation_question,
          status: i.job_status ?? "suspended",
          created_at: i.created_at,
          payload: null,
        }));
      setJobs(suspended);
    } catch (err) {
      logger.warn("[ProcessHitlSection] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 30_000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  if (loading || jobs.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">Process Approvals</h2>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
          {jobs.length} pending
        </span>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Automated business processes paused at human-in-the-loop gates.
      </p>
      <div className="space-y-3">
        {jobs.map((job) => (
          <ProcessApprovalRow key={job.id} job={job} onResolved={fetchJobs} />
        ))}
      </div>
      <div className="h-px bg-border-subtle" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ApprovalsClientProps {
  initialApprovals: WritebackApproval[];
  canApprove: boolean;
}

export function ApprovalsClient({ initialApprovals, canApprove }: ApprovalsClientProps) {
  const [approvals, setApprovals] = useState<WritebackApproval[]>(initialApprovals);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const fetchPending = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/connectors/writeback/pending");
      if (!res.ok) return;
      const json = (await res.json()) as { approvals: WritebackApproval[] };
      setApprovals(json.approvals ?? []);
      setLastRefreshed(new Date());
    } catch (err) {
      logger.warn("[ApprovalsClient] Failed to refresh:", err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchPending, 30_000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  async function handleAction(approvalId: string, action: "approve" | "reject") {
    const res = await fetch("/api/connectors/writeback/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId, action }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error((json as { error?: string }).error ?? "Request failed");
    }

    // Remove from list on success
    setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
  }

  const pendingCount = approvals.length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Process Engine Approvals — HITL gates */}
      <ProcessHitlSection />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Write-back Approvals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review agent actions before they execute on connected systems.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
              {pendingCount} pending
            </span>
          )}
          <button
            onClick={fetchPending}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border-subtle text-muted-foreground hover:text-foreground hover:bg-surface-hover disabled:opacity-50 transition-colors"
          >
            <svg
              className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Role notice for non-admins */}
      {!canApprove && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <svg
            className="w-4 h-4 text-amber-400 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-sm text-amber-400">
            You can view pending approvals but only admins and owners can approve or reject them.
          </p>
        </div>
      )}

      {/* Approval list */}
      {approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-border-subtle rounded-xl bg-surface">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
            <svg
              className="w-6 h-6 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground">No pending approvals</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            All agent actions are executing automatically. Enable{" "}
            <code className="text-accent text-[11px]">require_writeback_approval</code> in org
            metadata to gate agent write-backs.
          </p>
          <p className="text-[11px] text-muted/50 mt-4">
            Last checked: {lastRefreshed.toLocaleTimeString()}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((approval) => (
            <ApprovalRow
              key={approval.id}
              approval={approval}
              canApprove={canApprove}
              onAction={handleAction}
            />
          ))}
          <p className="text-[11px] text-muted/50 text-right pt-1">
            Last checked: {lastRefreshed.toLocaleTimeString()} · auto-refreshes every 30s
          </p>
        </div>
      )}
    </div>
  );
}
