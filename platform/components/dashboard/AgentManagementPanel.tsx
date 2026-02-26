"use client";

/**
 * AgentManagementPanel
 * =====================
 * Full CRUD + Run panel for SE-aaS agent definitions.
 *
 * Features:
 *   - Lists all agent definitions from /api/brain/agents
 *   - Shows last run status, domain, trigger type
 *   - "Run Agent" button — fires POST /api/brain/agents/[id]/run
 *   - "Pause / Restore" toggle
 *   - "Delete" (soft-archive) with confirmation
 *   - "New Agent" form: name, task_type (from valid domains), description, trigger
 *   - Polls the run job ID every 3s until complete
 */

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  domain: string;
  trigger: "manual" | "scheduled" | "event";
  schedule: string | null;
  requiredInputs: string[];
  payload: Record<string, unknown>;
  status: "active" | "paused" | "archived";
  brainEnabled: boolean;
  rlEnabled: boolean;
  memoryTracking: boolean;
  createdBy: string | null;
  createdAt: string;
  lastRun: {
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    errorMessage: string | null;
  } | null;
}

interface RunState {
  agentId: string;
  jobId: string;
  status: "pending" | "running" | "success" | "error";
  errorMessage: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_TASK_TYPES = [
  "pod-match",
  "early-warning",
  "scope-creep",
  "delivery-intelligence",
  "pr-review",
  "tdd-code-generator",
  "incident-diagnosis",
  "impact-analysis",
  "sql-analyzer",
  "test-data-generator",
  "design-doc-generator",
  "codebase-qa",
  "architecture-extractor",
  "custom",
] as const;

type TaskType = (typeof VALID_TASK_TYPES)[number];

const DOMAIN_ICONS: Record<string, string> = {
  "pod-match": "🎯",
  "early-warning": "⚡",
  "scope-creep": "📊",
  "delivery-intelligence": "🔍",
  "pr-review": "🔎",
  "tdd-code-generator": "🧪",
  "incident-diagnosis": "🚨",
  "impact-analysis": "💥",
  "sql-analyzer": "🗄️",
  "test-data-generator": "🎲",
  "design-doc-generator": "📝",
  "codebase-qa": "💬",
  "architecture-extractor": "🏗️",
  "custom": "⚙️",
};

const DOMAIN_LABELS: Record<string, string> = {
  "pod-match": "Pod Match",
  "early-warning": "Early Warning",
  "scope-creep": "Scope Creep",
  "delivery-intelligence": "Delivery Intel",
  "pr-review": "PR Review",
  "tdd-code-generator": "TDD Generator",
  "incident-diagnosis": "Incident Diagnosis",
  "impact-analysis": "Impact Analysis",
  "sql-analyzer": "SQL Analyzer",
  "test-data-generator": "Test Data Generator",
  "design-doc-generator": "Design Doc Generator",
  "codebase-qa": "Codebase QA",
  "architecture-extractor": "Architecture Extractor",
  "custom": "Custom",
};

const DOMAIN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "pod-match": { bg: "bg-accent/10", text: "text-accent", border: "border-accent/20" },
  "early-warning": { bg: "bg-warning/10", text: "text-warning", border: "border-warning/20" },
  "scope-creep": { bg: "bg-danger/10", text: "text-danger", border: "border-danger/20" },
  "delivery-intelligence": { bg: "bg-info/10", text: "text-info", border: "border-info/20" },
  "pr-review": { bg: "bg-brain-discovery/10", text: "text-brain-discovery", border: "border-brain-discovery/20" },
  "tdd-code-generator": { bg: "bg-success/10", text: "text-success", border: "border-success/20" },
  "incident-diagnosis": { bg: "bg-danger/10", text: "text-danger", border: "border-danger/20" },
  "impact-analysis": { bg: "bg-brain-alert/10", text: "text-brain-alert", border: "border-brain-alert/20" },
  "sql-analyzer": { bg: "bg-brain-training/10", text: "text-brain-training", border: "border-brain-training/20" },
  "test-data-generator": { bg: "bg-brain-active/10", text: "text-brain-active", border: "border-brain-active/20" },
  "design-doc-generator": { bg: "bg-accent/10", text: "text-accent", border: "border-accent/20" },
  "codebase-qa": { bg: "bg-info/10", text: "text-info", border: "border-info/20" },
  "architecture-extractor": { bg: "bg-brain-discovery/10", text: "text-brain-discovery", border: "border-brain-discovery/20" },
  custom: { bg: "bg-muted/10", text: "text-muted-foreground", border: "border-border-subtle" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDomainColor(domain: string) {
  return DOMAIN_COLORS[domain] ?? DOMAIN_COLORS.custom;
}

function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ── Create Agent Form ─────────────────────────────────────────────────────────

interface CreateAgentFormProps {
  onCreated: (agent: AgentDefinition) => void;
  onCancel: () => void;
}

function CreateAgentForm({ onCreated, onCancel }: CreateAgentFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState<TaskType>("pod-match");
  const [trigger, setTrigger] = useState<"manual" | "scheduled" | "event">("manual");
  const [schedule, setSchedule] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/brain/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          domain,
          trigger,
          schedule: trigger === "scheduled" && schedule.trim() ? schedule.trim() : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create agent");
      }

      const created = await res.json();
      onCreated({
        id: created.id,
        name: created.name,
        description: description.trim(),
        domain: created.domain,
        trigger: created.trigger,
        schedule: schedule.trim() || null,
        requiredInputs: [],
        payload: {},
        status: "active",
        brainEnabled: true,
        rlEnabled: true,
        memoryTracking: true,
        createdBy: null,
        createdAt: created.createdAt,
        lastRun: null,
      });
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-accent/20 rounded-xl p-5 space-y-4"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold">New Agent</h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded-lg hover:bg-surface-hover text-muted transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Agent Name <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Weekly Delivery Health Check"
          className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
          autoFocus
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this agent do?"
          className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
        />
      </div>

      {/* Domain */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Task Type (SE-aaS Domain) <span className="text-danger">*</span>
        </label>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value as TaskType)}
          className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground"
        >
          {VALID_TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOMAIN_ICONS[t]} {DOMAIN_LABELS[t] || t}
            </option>
          ))}
        </select>
      </div>

      {/* Trigger */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">Trigger</label>
        <div className="flex gap-2">
          {(["manual", "scheduled", "event"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTrigger(t)}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors capitalize",
                trigger === t
                  ? "bg-accent/10 text-accent border-accent/20"
                  : "bg-background border-border-subtle text-muted hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Schedule (only if scheduled) */}
      {trigger === "scheduled" && (
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Cron Schedule
            <span className="text-muted font-normal ml-1">(e.g., 0 9 * * 1 for every Monday at 9am)</span>
          </label>
          <input
            type="text"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="0 9 * * 1"
            className="w-full px-3 py-2 text-sm font-mono bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
          />
        </div>
      )}

      {error && (
        <div className="text-xs text-danger bg-danger/5 border border-danger/10 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="flex-1 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Creating..." : "Create Agent"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-muted hover:text-foreground border border-border-subtle rounded-lg hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Agent Row ─────────────────────────────────────────────────────────────────

interface AgentRowProps {
  agent: AgentDefinition;
  runState: RunState | null;
  onRun: (agent: AgentDefinition) => void;
  onTogglePause: (agent: AgentDefinition) => void;
  onDelete: (agent: AgentDefinition) => void;
}

function AgentRow({ agent, runState, onRun, onTogglePause, onDelete }: AgentRowProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const colors = getDomainColor(agent.domain);
  const isRunning = runState?.status === "pending" || runState?.status === "running";
  const isPaused = agent.status === "paused";
  const isArchived = agent.status === "archived";

  const lastRunStatus = runState?.status ?? agent.lastRun?.status ?? null;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all duration-200",
        isArchived
          ? "border-border-subtle bg-surface/30 opacity-60"
          : "border-border-subtle bg-card hover:border-border"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Domain Icon */}
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-lg mt-0.5",
            colors.bg
          )}
        >
          {DOMAIN_ICONS[agent.domain] ?? "⚙️"}
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-sm font-semibold truncate">{agent.name}</span>
            {/* Status badge */}
            {isPaused && (
              <Badge variant="warning" size="xs">Paused</Badge>
            )}
            {isArchived && (
              <Badge variant="default" size="xs">Archived</Badge>
            )}
            {/* Last run status */}
            {lastRunStatus && (
              <Badge
                variant={
                  lastRunStatus === "success" ? "success"
                  : lastRunStatus === "error" ? "danger"
                  : lastRunStatus === "running" || lastRunStatus === "pending" ? "accent"
                  : "default"
                }
                size="xs"
                pulse={isRunning}
              >
                {isRunning ? "Running" : lastRunStatus}
              </Badge>
            )}
          </div>

          {agent.description && (
            <p className="text-[11px] text-muted mb-2 line-clamp-1">{agent.description}</p>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {/* Domain tag */}
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border",
                colors.bg,
                colors.text,
                colors.border
              )}
            >
              {DOMAIN_LABELS[agent.domain] || agent.domain}
            </span>

            {/* Trigger */}
            <span className="text-[10px] text-muted flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {agent.trigger === "scheduled" ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                ) : agent.trigger === "event" ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                )}
              </svg>
              {agent.trigger}
              {agent.schedule && (
                <span className="font-mono text-[9px] bg-surface-hover px-1 py-0.5 rounded">
                  {agent.schedule}
                </span>
              )}
            </span>

            {/* Brain / RL flags */}
            {agent.brainEnabled && (
              <span className="text-[10px] text-accent">Brain</span>
            )}
            {agent.rlEnabled && (
              <span className="text-[10px] text-brain-training">RL</span>
            )}

            {/* Last run time */}
            <span className="text-[10px] text-muted">
              Last: {formatTimeAgo(agent.lastRun?.startedAt ?? agent.lastRun?.completedAt ?? null)}
            </span>
          </div>

          {/* Error message from last run */}
          {runState?.status === "error" && runState.errorMessage && (
            <p className="text-[10px] text-danger mt-1.5 bg-danger/5 px-2 py-1 rounded-lg border border-danger/10 line-clamp-2 font-mono">
              {runState.errorMessage}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Run Button */}
          {!isArchived && (
            <button
              onClick={() => onRun(agent)}
              disabled={isRunning || isPaused}
              title={isPaused ? "Resume agent first" : "Run agent now"}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5",
                isRunning
                  ? "bg-accent/10 text-accent cursor-not-allowed"
                  : isPaused
                  ? "bg-surface text-muted cursor-not-allowed border border-border-subtle"
                  : "bg-accent text-white hover:bg-accent/90"
              )}
            >
              {isRunning ? (
                <>
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Running
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                  </svg>
                  Run
                </>
              )}
            </button>
          )}

          {/* Pause / Resume toggle */}
          {!isArchived && (
            <button
              onClick={() => onTogglePause(agent)}
              title={isPaused ? "Resume agent" : "Pause agent"}
              className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-hover transition-colors border border-transparent hover:border-border-subtle"
            >
              {isPaused ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                </svg>
              )}
            </button>
          )}

          {/* Delete / Restore */}
          {!isArchived ? (
            showDeleteConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { onDelete(agent); setShowDeleteConfirm(false); }}
                  className="px-2 py-1 text-[10px] font-medium bg-danger/10 text-danger border border-danger/20 rounded-lg hover:bg-danger/20 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-2 py-1 text-[10px] font-medium text-muted hover:text-foreground border border-border-subtle rounded-lg hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                title="Archive agent"
                className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/5 transition-colors border border-transparent hover:border-danger/20"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </button>
            )
          ) : (
            <button
              onClick={() => onTogglePause(agent)}
              title="Restore agent"
              className="px-2 py-1 text-[10px] font-medium text-muted hover:text-foreground border border-border-subtle rounded-lg hover:bg-surface-hover transition-colors"
            >
              Restore
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export interface AgentManagementPanelProps {
  /** If provided, only show agents for this domain */
  domainFilter?: string;
  /** Title override */
  title?: string;
  /** Compact mode hides description and some metadata */
  compact?: boolean;
}

export function AgentManagementPanel({
  domainFilter,
  title = "Agent Definitions",
  compact = false,
}: AgentManagementPanelProps) {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [runStates, setRunStates] = useState<Map<string, RunState>>(new Map());
  const [filterDomain, setFilterDomain] = useState<string>(domainFilter ?? "all");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Fetch agents ──────────────────────────────────────────────────────────

  const fetchAgents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (domainFilter) params.set("domain", domainFilter);
      const res = await fetch(`/api/brain/agents?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAgents(data.agents ?? []);
      setError(null);
    } catch (e: any) {
      setError("Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, [domainFilter]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // ── Poll running jobs ─────────────────────────────────────────────────────

  useEffect(() => {
    const activeRuns = Array.from(runStates.values()).filter(
      (r) => r.status === "pending" || r.status === "running"
    );
    if (activeRuns.length === 0) return;

    const interval = setInterval(async () => {
      for (const run of activeRuns) {
        try {
          const res = await fetch(
            `/api/brain/agents/${run.agentId}/run?jobId=${run.jobId}`
          );
          if (!res.ok) continue;
          const data = await res.json();
          setRunStates((prev) => {
            const next = new Map(prev);
            next.set(run.agentId, {
              ...run,
              status: data.status,
              errorMessage: data.errorMessage ?? null,
            });
            return next;
          });
        } catch {
          // Non-fatal
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [runStates]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleRun = useCallback(async (agent: AgentDefinition) => {
    try {
      const res = await fetch(`/api/brain/agents/${agent.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to trigger run");
      }
      const data = await res.json();
      setRunStates((prev) => {
        const next = new Map(prev);
        next.set(agent.id, {
          agentId: agent.id,
          jobId: data.jobId,
          status: "pending",
          errorMessage: null,
        });
        return next;
      });
    } catch (err: any) {
      setError(err.message || "Failed to trigger run");
    }
  }, []);

  const handleTogglePause = useCallback(async (agent: AgentDefinition) => {
    const newStatus: "active" | "paused" =
      agent.status === "archived"
        ? "active"
        : agent.status === "paused"
        ? "active"
        : "paused";

    try {
      const res = await fetch(`/api/brain/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update agent");
      }
      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, status: newStatus } : a))
      );
    } catch (err: any) {
      setError(err.message || "Failed to update agent");
    }
  }, []);

  const handleDelete = useCallback(async (agent: AgentDefinition) => {
    try {
      const res = await fetch(`/api/brain/agents/${agent.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to archive agent");
      }
      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, status: "archived" } : a))
      );
    } catch (err: any) {
      setError(err.message || "Failed to archive agent");
    }
  }, []);

  const handleCreated = useCallback((agent: AgentDefinition) => {
    setAgents((prev) => [agent, ...prev]);
    setShowCreate(false);
  }, []);

  // ── Derived: filtered agents ───────────────────────────────────────────────

  const displayedAgents = agents.filter((a) => {
    if (a.status === "archived") return false;
    if (filterDomain !== "all" && a.domain !== filterDomain) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.domain.toLowerCase().includes(q) ||
        (a.description || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const archivedAgents = agents.filter((a) => a.status === "archived");

  // ── Unique domains for filter pills ──────────────────────────────────────

  const availableDomains = Array.from(new Set(agents.map((a) => a.domain)));

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-4 w-36 bg-surface-hover rounded animate-pulse" />
          <div className="h-7 w-24 bg-surface-hover rounded-lg animate-pulse" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-surface rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-[11px] text-muted mt-0.5">
            {displayedAgents.length} agent{displayedAgents.length !== 1 ? "s" : ""}
            {archivedAgents.length > 0 && ` · ${archivedAgents.length} archived`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Refresh */}
          <button
            onClick={fetchAgents}
            className="p-1.5 rounded-lg border border-border-subtle text-muted hover:text-foreground hover:bg-surface transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {/* New Agent */}
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent/90 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Agent
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <CreateAgentForm
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-danger/5 border border-danger/20 rounded-xl text-xs text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-3 opacity-70 hover:opacity-100 transition-opacity">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Filter row */}
      {!compact && (agents.length > 3 || searchQuery) && (
        <div className="flex items-center gap-2">
          {/* Domain pills */}
          {availableDomains.length > 1 && !domainFilter && (
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setFilterDomain("all")}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                  filterDomain === "all"
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:text-foreground bg-surface"
                )}
              >
                All
              </button>
              {availableDomains.map((d) => (
                <button
                  key={d}
                  onClick={() => setFilterDomain(filterDomain === d ? "all" : d)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                    filterDomain === d
                      ? `${getDomainColor(d).bg} ${getDomainColor(d).text}`
                      : "text-muted hover:text-foreground bg-surface"
                  )}
                >
                  {DOMAIN_ICONS[d]} {DOMAIN_LABELS[d] || d}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative ml-auto">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search agents..."
              className="pl-7 pr-3 py-1 text-xs bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted w-40"
            />
          </div>
        </div>
      )}

      {/* Agent list */}
      {displayedAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-border-subtle bg-card">
          <div className="text-3xl mb-3">🤖</div>
          <h3 className="text-sm font-medium mb-1">
            {searchQuery || filterDomain !== "all" ? "No matching agents" : "No agents yet"}
          </h3>
          <p className="text-xs text-muted max-w-xs">
            {searchQuery
              ? `No agents match "${searchQuery}".`
              : filterDomain !== "all"
              ? `No agents for domain "${filterDomain}".`
              : "Create your first agent definition to automate SE-aaS tasks on a schedule or trigger."}
          </p>
          {!searchQuery && filterDomain === "all" && !showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 px-3 py-1.5 bg-accent/10 text-accent text-xs font-medium rounded-lg hover:bg-accent/20 transition-colors"
            >
              Create First Agent
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {displayedAgents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              runState={runStates.get(agent.id) ?? null}
              onRun={handleRun}
              onTogglePause={handleTogglePause}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Archived section (collapsed) */}
      {archivedAgents.length > 0 && (
        <details className="group">
          <summary className="text-[11px] text-muted cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1.5 select-none">
            <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            {archivedAgents.length} archived agent{archivedAgents.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-2 space-y-2">
            {archivedAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                runState={null}
                onRun={handleRun}
                onTogglePause={handleTogglePause}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
