"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Module-level supabase client
const supabase = createClient();

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  orgId: string;
  workerId: string;
}

type Tab = "chat" | "agents" | "jobs" | "brain" | "keys";

interface WorkerData {
  id: string;
  name: string;
  description?: string | null;
  service_type?: string | null;
  status: string;
  config?: Record<string, unknown> | null;
  created_at: string;
}

interface RLStatus {
  brainIq: number;
  totalSignals24h: number;
  learningVelocity: number;
  improvementThisSession: number;
  signalsThisHour: number;
}

interface WorkerHealth {
  runningJobs: number;
  pendingJobs: number;
  succeededLast1h: number;
  failedLast1h: number;
}

interface TierStats {
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
}

interface AgentRecord {
  id: string;
  name: string;
  purpose?: string | null;
  status: string;
  created_by: string;
  created_at: string;
  completed_at?: string | null;
}

interface JobRecord {
  id: string;
  agent_type?: string | null;
  task_type?: string | null;
  status: string;
  priority?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at?: string | null;
  created_at: string;
  is_active: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  running: "bg-accent animate-pulse",
  pending: "bg-warning",
  success: "bg-success",
  error: "bg-danger",
  waiting: "bg-warning",
  active: "bg-success",
  completed: "bg-success",
  paused: "bg-warning",
  archived: "bg-muted",
  revoked: "bg-danger",
};

const STATUS_TEXT: Record<string, string> = {
  running: "text-accent",
  pending: "text-warning",
  success: "text-success",
  error: "text-danger",
  waiting: "text-warning",
  active: "text-success",
  completed: "text-success",
  paused: "text-warning",
  archived: "text-muted",
  revoked: "text-danger",
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AIWorkerControlClient({ orgId, workerId }: Props) {
  const router = useRouter();

  // All hooks before any early return
  const [worker, setWorker] = useState<WorkerData | null>(null);
  const [allWorkers, setAllWorkers] = useState<WorkerData[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("chat");

  // Brain tab state
  const [rlStatus, setRlStatus] = useState<RLStatus | null>(null);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealth | null>(null);
  const [tierStats, setTierStats] = useState<TierStats | null>(null);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [consolidationMsg, setConsolidationMsg] = useState<string | null>(null);
  const [brainLoading, setBrainLoading] = useState(true);

  // Agents tab state
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  // Jobs tab state
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Keys tab state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);
  const [newKeyError, setNewKeyError] = useState<string | null>(null);

  // Fetch worker from DB
  useEffect(() => {
    fetch(`/api/ai-workers/${workerId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.worker) setWorker(d.worker);
      })
      .catch(() => {
        // non-fatal
      });
  }, [workerId]);

  // Fetch all workers for switcher
  useEffect(() => {
    fetch("/api/ai-workers")
      .then((r) => r.json())
      .then((d) => setAllWorkers(d.workers ?? []))
      .catch(() => {
        // non-fatal
      });
  }, []);

  // Brain data fetching
  const fetchBrainData = useCallback(async () => {
    const workerParam = `?workerId=${encodeURIComponent(workerId)}`;
    const evolutionUrl = orgId
      ? `/api/brain/evolution?organizationId=${encodeURIComponent(orgId)}`
      : null;

    const [rlRes, healthRes, evolutionRes] = await Promise.allSettled([
      fetch(`/api/brain/rl-status${workerParam}`),
      fetch(`/api/brain/worker-health${workerParam}`),
      evolutionUrl ? fetch(evolutionUrl) : Promise.resolve(null),
    ]);

    let brainIq = 0;
    if (evolutionRes.status === "fulfilled" && evolutionRes.value && evolutionRes.value.ok) {
      const ev = await evolutionRes.value.json();
      const state = ev?.evolution ?? ev?.state;
      brainIq = state?.intelligenceScore ?? 0;
    }

    if (rlRes.status === "fulfilled" && rlRes.value.ok) {
      const d = await rlRes.value.json();
      setRlStatus({
        brainIq,
        totalSignals24h: d.totalSignals24h ?? d.signalsThisSession ?? 0,
        learningVelocity: d.learningVelocity ?? 0,
        improvementThisSession: d.improvementThisSession ?? 0,
        signalsThisHour: d.signalsThisHour ?? 0,
      });
    }

    if (healthRes.status === "fulfilled" && healthRes.value.ok) {
      const d = await healthRes.value.json();
      setWorkerHealth({
        runningJobs: d.runningJobs ?? 0,
        pendingJobs: d.pendingJobs ?? 0,
        succeededLast1h: d.succeededLast1h ?? 0,
        failedLast1h: d.failedLast1h ?? 0,
      });
    }

    setBrainLoading(false);
  }, [workerId, orgId]);

  const fetchTierStats = useCallback(async () => {
    try {
      const res = await fetch("/api/brain/tier-stats");
      if (res.ok) {
        const d = await res.json();
        setTierStats({
          tier1Count: d.tier1Count ?? 0,
          tier2Count: d.tier2Count ?? 0,
          tier3Count: d.tier3Count ?? 0,
        });
      }
    } catch {
      // non-fatal
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const res = await fetch(`/api/ai-workers/${workerId}/agents`);
      if (res.ok) {
        const d = await res.json();
        setAgents(d.agents ?? []);
      }
    } catch {
      // non-fatal
    } finally {
      setAgentsLoading(false);
    }
  }, [workerId]);

  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const res = await fetch(`/api/ai-workers/${workerId}/jobs`);
      if (res.ok) {
        const d = await res.json();
        setJobs(d.jobs ?? []);
      }
    } catch {
      // non-fatal
    } finally {
      setJobsLoading(false);
    }
  }, [workerId]);

  const fetchKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const res = await fetch(`/api/ai-workers/${workerId}/keys`);
      if (res.ok) {
        const d = await res.json();
        setApiKeys(d.keys ?? []);
      }
    } catch {
      // non-fatal
    } finally {
      setKeysLoading(false);
    }
  }, [workerId]);

  // Initial brain data load + polling
  useEffect(() => {
    fetchBrainData();
    fetchTierStats();

    const fastInterval = setInterval(fetchBrainData, 30_000);
    const slowInterval = setInterval(fetchTierStats, 60_000);

    return () => {
      clearInterval(fastInterval);
      clearInterval(slowInterval);
    };
  }, [fetchBrainData, fetchTierStats]);

  // Load tab-specific data when tab changes
  useEffect(() => {
    if (activeTab === "agents") fetchAgents();
    if (activeTab === "jobs") fetchJobs();
    if (activeTab === "keys") fetchKeys();
  }, [activeTab, fetchAgents, fetchJobs, fetchKeys]);

  // Real-time job updates via Supabase
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("cockpit-jobs-v2")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_queue",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          fetchBrainData();
          if (activeTab === "jobs") fetchJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchBrainData, fetchJobs, activeTab]);

  // Run Tier 3 consolidation
  const runConsolidation = useCallback(async () => {
    if (isConsolidating) return;
    setIsConsolidating(true);
    setConsolidationMsg(null);
    try {
      const res = await fetch("/api/brain/consolidation", { method: "POST" });
      if (res.ok) {
        const d = await res.json();
        const promoted = d.patternsPromoted ?? d.promoted ?? 0;
        setConsolidationMsg(
          `Done — ${promoted} pattern${promoted !== 1 ? "s" : ""} consolidated`
        );
        await fetchTierStats();
      } else {
        setConsolidationMsg("Consolidation failed");
      }
    } catch {
      setConsolidationMsg("Consolidation failed");
    } finally {
      setIsConsolidating(false);
      setTimeout(() => setConsolidationMsg(null), 5000);
    }
  }, [isConsolidating, fetchTierStats]);

  // Create API key
  const createKey = useCallback(async () => {
    if (!newKeyName.trim() || creatingKey) return;
    setCreatingKey(true);
    setNewKeyRaw(null);
    setNewKeyError(null);
    try {
      const res = await fetch(`/api/ai-workers/${workerId}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const d = await res.json();
      if (res.ok && d.key) {
        setNewKeyRaw(d.key);
        setNewKeyName("");
        await fetchKeys();
      } else {
        setNewKeyError(d.error ?? "Failed to create key");
      }
    } catch {
      setNewKeyError("Failed to create key");
    } finally {
      setCreatingKey(false);
    }
  }, [workerId, newKeyName, creatingKey, fetchKeys]);

  // Derived
  const isLearning = (rlStatus?.learningVelocity ?? 0) > 0;
  const workerName = worker?.name ?? "AI Worker";
  const serviceType = worker?.service_type ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur px-4 h-14 flex items-center gap-3">
        {/* BrainOS logo to /workspace */}
        <Link
          href="/workspace"
          className="text-sm font-semibold text-foreground/70 hover:text-foreground flex items-center gap-2 transition-colors"
        >
          <span className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
            B
          </span>
          BrainOS
        </Link>

        <span className="text-foreground/20 text-lg">/</span>

        {/* Worker switcher dropdown */}
        <select
          value={workerId}
          onChange={(e) => router.push(`/ai-worker/${e.target.value}`)}
          className="text-sm text-foreground bg-transparent border-none outline-none cursor-pointer font-medium"
        >
          {allWorkers.length === 0 ? (
            <option value={workerId}>{workerName}</option>
          ) : (
            allWorkers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))
          )}
        </select>

        {/* Service badge */}
        {serviceType && (
          <span className="text-[10px] px-2 py-0.5 rounded border bg-orange-500/10 border-orange-500/20 text-orange-400 uppercase tracking-wide font-semibold">
            {serviceType}
          </span>
        )}

        <div className="flex-1" />

        {/* Learning indicator */}
        {isLearning && (
          <div className="flex items-center gap-1.5 text-xs text-orange-400 mr-2">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            Learning
          </div>
        )}

        {/* Status dot */}
        <span
          className={`w-2 h-2 rounded-full ${
            worker?.status === "active" ? "bg-success" : "bg-muted"
          }`}
        />
        <span className="text-xs text-muted">{worker?.status ?? "active"}</span>
      </header>

      {/* ── Tab navigation ────────────────────────────────────────────────── */}
      <nav className="flex gap-0 border-b border-border px-4 bg-background">
        {(["chat", "agents", "jobs", "brain", "keys"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm capitalize transition-colors ${
              activeTab === tab
                ? "text-foreground border-b-2 border-primary -mb-px font-medium"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* ── Tab panels ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "chat" && (
          <ChatTab workerId={workerId} workerName={workerName} />
        )}
        {activeTab === "agents" && (
          <AgentsTab
            agents={agents}
            loading={agentsLoading}
            onRefresh={fetchAgents}
          />
        )}
        {activeTab === "jobs" && (
          <JobsTab jobs={jobs} loading={jobsLoading} onRefresh={fetchJobs} />
        )}
        {activeTab === "brain" && (
          <BrainTab
            rlStatus={rlStatus}
            workerHealth={workerHealth}
            tierStats={tierStats}
            isLoading={brainLoading}
            isLearning={isLearning}
            isConsolidating={isConsolidating}
            consolidationMsg={consolidationMsg}
            onConsolidate={runConsolidation}
          />
        )}
        {activeTab === "keys" && (
          <KeysTab
            apiKeys={apiKeys}
            loading={keysLoading}
            newKeyName={newKeyName}
            onNewKeyNameChange={setNewKeyName}
            onCreateKey={createKey}
            creatingKey={creatingKey}
            newKeyRaw={newKeyRaw}
            onDismissKey={() => setNewKeyRaw(null)}
            newKeyError={newKeyError}
          />
        )}
      </div>
    </div>
  );
}

// ── Chat Tab ──────────────────────────────────────────────────────────────────

function ChatTab({
  workerName,
}: {
  workerId: string;
  workerName: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <svg
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          className="text-primary"
        >
          <path
            d="M4 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7l-4 3V6a2 2 0 0 1 2-2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-foreground mb-1">
        Chat with {workerName}
      </p>
      <p className="text-xs text-muted mb-4 max-w-sm">
        Direct chat interface for this AI worker space is coming soon. Use the
        Copilot for now.
      </p>
      <button
        type="button"
        onClick={() => {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
        }}
        className="text-xs px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
      >
        Open Copilot
      </button>
    </div>
  );
}

// ── Agents Tab ────────────────────────────────────────────────────────────────

function AgentsTab({
  agents,
  loading,
  onRefresh,
}: {
  agents: AgentRecord[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>Agents</SectionLabel>
        <button
          onClick={onRefresh}
          className="text-[11px] text-muted hover:text-foreground/60 transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : agents.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              className="text-muted/80"
            >
              <circle
                cx="9"
                cy="9"
                r="7"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M9 6v3l2 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          }
          title="No agents yet"
          subtitle="Agents created by Copilot or the planner will appear here"
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Name
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Purpose
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Status
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Created by
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, i) => (
                <tr
                  key={agent.id}
                  className={`border-b border-border/50 hover:bg-white/[0.02] transition-colors ${
                    i === agents.length - 1 ? "border-b-0" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-foreground/80 font-medium">
                    {agent.name}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs max-w-[220px] truncate">
                    {agent.purpose ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={agent.status} />
                  </td>
                  <td className="px-4 py-3 text-muted text-xs capitalize">
                    {agent.created_by}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {timeAgo(agent.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Jobs Tab ──────────────────────────────────────────────────────────────────

function JobsTab({
  jobs,
  loading,
  onRefresh,
}: {
  jobs: JobRecord[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>Jobs</SectionLabel>
        <button
          onClick={onRefresh}
          className="text-[11px] text-muted hover:text-foreground/60 transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              className="text-muted/80"
            >
              <path
                d="M9 3v6l4 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle
                cx="9"
                cy="9"
                r="7"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          }
          title="No jobs yet"
          subtitle="Jobs dispatched to this AI worker will appear here"
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Task type
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Agent type
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Status
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Priority
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job, i) => (
                <tr
                  key={job.id}
                  className={`border-b border-border/50 hover:bg-white/[0.02] transition-colors ${
                    i === jobs.length - 1 ? "border-b-0" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-foreground/80 font-medium">
                    {job.task_type
                      ?.replace(/-/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase()) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs capitalize">
                    {job.agent_type ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-3 text-muted text-xs capitalize">
                    {job.priority ?? "normal"}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {timeAgo(job.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Brain Tab ─────────────────────────────────────────────────────────────────

function BrainTab({
  rlStatus,
  workerHealth,
  tierStats,
  isLoading,
  isLearning,
  isConsolidating,
  consolidationMsg,
  onConsolidate,
}: {
  rlStatus: RLStatus | null;
  workerHealth: WorkerHealth | null;
  tierStats: TierStats | null;
  isLoading: boolean;
  isLearning: boolean;
  isConsolidating: boolean;
  consolidationMsg: string | null;
  onConsolidate: () => void;
}) {
  return (
    <div className="p-6 max-w-4xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Brain IQ card */}
        <div className="rounded-xl border border-border bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>Brain Intelligence</SectionLabel>
            {isLearning && (
              <span className="text-[10px] font-medium text-orange-400 uppercase tracking-wide flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-orange-400 animate-pulse" />
                Learning
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <div className="h-10 w-16 rounded bg-white/[0.06] animate-pulse" />
                <div className="h-4 w-5 rounded bg-white/[0.04] animate-pulse mb-1.5" />
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-white/[0.08] rounded-full animate-pulse" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="h-3 w-16 rounded bg-white/[0.04] animate-pulse" />
                    <div className="h-3 w-8 rounded bg-white/[0.06] animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-end gap-2 mb-1">
                <span className="text-4xl font-bold text-accent">
                  {rlStatus?.brainIq ?? 0}
                </span>
                <span className="text-sm text-muted mb-1.5">IQ</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-accent/60 rounded-full transition-all duration-1000"
                  style={{
                    width: `${Math.min(100, rlStatus?.brainIq ?? 0)}%`,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <MetricRow
                  label="Signals (24h)"
                  value={String(rlStatus?.totalSignals24h ?? 0)}
                />
                <MetricRow
                  label="Improvement"
                  value={`${Math.round(
                    (rlStatus?.improvementThisSession ?? 0) * 100
                  )}%`}
                />
                <MetricRow
                  label="Velocity"
                  value={String(rlStatus?.learningVelocity ?? 0)}
                />
                <MetricRow
                  label="This Hour"
                  value={String(rlStatus?.signalsThisHour ?? 0)}
                />
              </div>
            </>
          )}
        </div>

        {/* Worker health card */}
        <div className="rounded-xl border border-border bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>Worker Health</SectionLabel>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-3 w-16 rounded bg-white/[0.04] animate-pulse" />
                  <div className="h-3 w-8 rounded bg-white/[0.06] animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <MetricRow
                label="Running"
                value={String(workerHealth?.runningJobs ?? 0)}
                valueClass={
                  workerHealth?.runningJobs ? "text-accent" : "text-foreground/70"
                }
              />
              <MetricRow
                label="Pending"
                value={String(workerHealth?.pendingJobs ?? 0)}
                valueClass="text-warning"
              />
              <MetricRow
                label="Done (1h)"
                value={String(workerHealth?.succeededLast1h ?? 0)}
                valueClass="text-success"
              />
              <MetricRow
                label="Failed (1h)"
                value={String(workerHealth?.failedLast1h ?? 0)}
                valueClass={
                  workerHealth?.failedLast1h ? "text-danger" : "text-foreground/70"
                }
              />
            </div>
          )}
        </div>

        {/* Knowledge Tiers */}
        <div className="rounded-xl border border-border bg-white/[0.03] p-5 md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>Knowledge Tiers</SectionLabel>
          </div>

          <div className="space-y-2.5">
            <TierRow
              label="T1"
              name="Raw Knowledge"
              table="knowledge_chunks"
              count={tierStats?.tier1Count ?? null}
              colorClass="text-accent"
              bgClass="bg-accent/15"
            />
            <TierRow
              label="T2"
              name="Signals (24h)"
              table="cross_domain_signals"
              count={tierStats?.tier2Count ?? null}
              colorClass="text-purple-400"
              bgClass="bg-purple-500/15"
            />
            <TierRow
              label="T3"
              name="Consolidated"
              table="consolidated_patterns"
              count={tierStats?.tier3Count ?? null}
              colorClass="text-success"
              bgClass="bg-success/15"
            />
          </div>

          <div className="mt-4">
            {consolidationMsg ? (
              <p className="text-xs text-success/80 text-center py-2">
                {consolidationMsg}
              </p>
            ) : (
              <button
                onClick={onConsolidate}
                disabled={isConsolidating}
                className="w-full py-2 rounded-lg border border-border text-xs text-muted hover:border-success/30 hover:text-success/70 hover:bg-success/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isConsolidating ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    Consolidating...
                  </>
                ) : (
                  "Run Consolidation"
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Keys Tab ──────────────────────────────────────────────────────────────────

function KeysTab({
  apiKeys,
  loading,
  newKeyName,
  onNewKeyNameChange,
  onCreateKey,
  creatingKey,
  newKeyRaw,
  onDismissKey,
  newKeyError,
}: {
  apiKeys: ApiKey[];
  loading: boolean;
  newKeyName: string;
  onNewKeyNameChange: (v: string) => void;
  onCreateKey: () => void;
  creatingKey: boolean;
  newKeyRaw: string | null;
  onDismissKey: () => void;
  newKeyError: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const copyKey = () => {
    if (newKeyRaw) {
      navigator.clipboard.writeText(newKeyRaw).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <SectionLabel>API Keys</SectionLabel>
        <p className="text-xs text-muted mb-4">
          Keys are scoped to this AI worker. Bearer token authentication only.
        </p>

        {/* New key creation row */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => onNewKeyNameChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCreateKey()}
            placeholder="Key name (e.g. Production CI)"
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-surface text-foreground placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors"
          />
          <button
            onClick={onCreateKey}
            disabled={creatingKey || !newKeyName.trim()}
            className="px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creatingKey ? "Creating..." : "Create"}
          </button>
        </div>

        {newKeyError && (
          <p className="text-xs text-danger mb-3">{newKeyError}</p>
        )}

        {/* One-time key reveal */}
        {newKeyRaw && (
          <div className="mb-4 p-4 rounded-lg border border-success/30 bg-success/5">
            <p className="text-xs text-success font-medium mb-2">
              Save this key now — it will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-foreground/70 bg-surface px-3 py-2 rounded border border-border break-all">
                {newKeyRaw}
              </code>
              <button
                onClick={copyKey}
                className="text-xs px-3 py-2 rounded border border-border text-muted hover:text-foreground transition-colors flex-shrink-0"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <button
              onClick={onDismissKey}
              className="text-[11px] text-muted hover:text-foreground/50 transition-colors mt-2"
            >
              I have saved the key — dismiss
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={3} cols={5} />
      ) : apiKeys.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              className="text-muted/80"
            >
              <path
                d="M11.5 3a4.5 4.5 0 0 1 0 9 4.5 4.5 0 0 1-4.347-3.364L3 12.768V15h2.25v-1.5H7.5V12h2.25l.014-.015A4.5 4.5 0 0 1 11.5 3z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="12.5" cy="5.5" r="1" fill="currentColor" />
            </svg>
          }
          title="No API keys"
          subtitle="Create a key to authenticate A2A calls to this worker"
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Name
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Prefix
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Status
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Last used
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((key, i) => (
                <tr
                  key={key.id}
                  className={`border-b border-border/50 hover:bg-white/[0.02] transition-colors ${
                    i === apiKeys.length - 1 ? "border-b-0" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-foreground/80 font-medium">
                    {key.name}
                  </td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">
                    {key.key_prefix}...
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={key.is_active ? "active" : "revoked"} />
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {key.last_used_at ? timeAgo(key.last_used_at) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {formatDate(key.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">
      {children}
    </p>
  );
}

function MetricRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted text-xs">{label}</span>
      <span
        className={`text-xs font-medium ${valueClass ?? "text-foreground/70"}`}
      >
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const dot = STATUS_DOT[status] ?? "bg-muted";
  const text = STATUS_TEXT[status] ?? "text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {status}
    </span>
  );
}

function TierRow({
  label,
  name,
  table,
  count,
  colorClass,
  bgClass,
}: {
  label: string;
  name: string;
  table: string;
  count: number | null;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03]">
      <div
        className={`w-5 h-5 rounded flex items-center justify-center ${bgClass} flex-shrink-0`}
      >
        <span className={`text-[9px] font-bold ${colorClass}`}>{label}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground/60">{name}</p>
        <p className="text-[10px] text-muted">{table}</p>
      </div>
      <span className={`text-sm font-bold ${colorClass}`}>
        {count !== null ? count.toLocaleString() : "—"}
      </span>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="py-16 text-center">
      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
        {icon}
      </div>
      <p className="text-sm text-muted">{title}</p>
      <p className="text-xs text-muted/60 mt-1 max-w-xs mx-auto">{subtitle}</p>
    </div>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="border-b border-border bg-surface px-4 py-2.5 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={i}
            className="h-2 w-16 rounded bg-white/[0.06] animate-pulse"
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 border-b border-border/50 last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className={`h-3 rounded bg-white/[0.04] animate-pulse ${
                j === 0 ? "w-32" : "w-20"
              }`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
