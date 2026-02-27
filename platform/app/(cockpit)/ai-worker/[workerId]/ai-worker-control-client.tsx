"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Module-level supabase client (avoids complex TypeScript with dynamic imports in useEffect)
const supabase = createClient();

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  orgId: string;
  workerId: string;
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

interface Connector {
  connector_type: string;
  status: string;
  last_sync_at: string | null;
  error_message: string | null;
}

interface AgentJob {
  id: string;
  task_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  running: "bg-accent animate-pulse",
  pending: "bg-warning",
  success: "bg-success",
  error: "bg-danger",
  waiting: "bg-warning",
};

const STATUS_TEXT: Record<string, string> = {
  running: "text-accent",
  pending: "text-warning",
  success: "text-success",
  error: "text-danger",
  waiting: "text-warning",
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  return `${Math.floor(diff / 3600000)}h`;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AIWorkerControlClient({ orgId, workerId }: Props) {
  const router = useRouter();

  // All hooks BEFORE any early return
  const [workerName, setWorkerName] = useState("AI Worker");
  const [serviceMode, setServiceMode] = useState("SE-aaS");
  const [rlStatus, setRlStatus] = useState<RLStatus | null>(null);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealth | null>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [recentJobs, setRecentJobs] = useState<AgentJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tierStats, setTierStats] = useState<TierStats | null>(null);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [consolidationMsg, setConsolidationMsg] = useState<string | null>(null);

  // Read worker context from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const name = localStorage.getItem("nexus_ai_worker_name");
      const mode = localStorage.getItem("nexus_service_mode");
      if (name) setWorkerName(name);
      if (mode) setServiceMode(mode);
    }
  }, []);

  // Fetch all data from APIs (scoped to this specific worker when workerId is available)
  const fetchAll = useCallback(async () => {
    const workerParam = workerId ? `?workerId=${encodeURIComponent(workerId)}` : "";
    // Evolution endpoint requires organizationId — use orgId if available
    const evolutionUrl = orgId
      ? `/api/brain/evolution?organizationId=${encodeURIComponent(orgId)}`
      : null;

    const [rlRes, healthRes, connRes, evolutionRes] = await Promise.allSettled([
      fetch(`/api/brain/rl-status${workerParam}`),
      fetch(`/api/brain/worker-health${workerParam}`),
      fetch("/api/connectors/health"),
      evolutionUrl ? fetch(evolutionUrl) : Promise.resolve(null),
    ]);

    // Derive IQ from evolution endpoint (same source as dashboard) — fallback to rl-status
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

    if (connRes.status === "fulfilled" && connRes.value.ok) {
      const d = await connRes.value.json();
      setConnectors(d.connectors ?? []);
    }

    setIsLoading(false);
  }, [workerId, orgId]);

  // Fetch recent jobs via Supabase client
  const fetchJobs = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data } = await supabase
        .from("agent_queue")
        .select(
          "id, task_type, status, created_at, completed_at, error_message"
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(15);
      if (data) setRecentJobs(data as AgentJob[]);
    } catch {
      // non-fatal
    }
  }, [orgId]);

  // Fetch 3-tier brain knowledge counts
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

  // Real-time job updates
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("cockpit-jobs")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_queue",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          fetchJobs();
          fetchAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchJobs, fetchAll]);

  // Initial load + polling (30s for RL/health/jobs, 60s for tier counts)
  useEffect(() => {
    fetchAll();
    fetchJobs();
    fetchTierStats();

    const fastInterval = setInterval(() => {
      fetchAll();
      fetchJobs();
    }, 30_000);

    const slowInterval = setInterval(() => {
      fetchTierStats();
    }, 60_000);

    return () => {
      clearInterval(fastInterval);
      clearInterval(slowInterval);
    };
  }, [fetchAll, fetchJobs, fetchTierStats]);

  // Derived values
  const isLearning = (rlStatus?.learningVelocity ?? 0) > 0;
  const connectedCount = connectors.filter(
    (c) => c.status === "active" || c.status === "syncing"
  ).length;
  const serviceLabel =
    serviceMode?.toLowerCase().includes("seaas") ||
    serviceMode?.toLowerCase().includes("se-aas")
      ? "SE-aaS"
      : serviceMode?.toLowerCase().includes("aaas") ||
        serviceMode?.toLowerCase().includes("a-aas")
      ? "AaaS"
      : serviceMode ?? "SE-aaS";

  // Split jobs for display
  const runningJobs = recentJobs.filter((j) => j.status === "running");
  const doneJobs = recentJobs.filter(
    (j) => j.status === "success" || j.status === "error"
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-5 h-12 border-b border-white/[0.06] bg-[#0a0a0a]/90 backdrop-blur-sm">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-1.5 text-white/30 hover:text-white/70 transition-colors text-sm"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 11L5 7l4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          BrainOS
        </button>

        <span className="text-white/10 text-lg">/</span>
        <span className="text-sm font-medium text-white/80 truncate max-w-[200px]">
          {workerName}
        </span>
        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/20 uppercase tracking-wide">
          {serviceLabel}
        </span>

        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          <span className="text-xs text-white/30">Active</span>
        </div>

        <div className="flex-1" />

        {isLearning && (
          <div className="flex items-center gap-1.5 text-xs text-orange-400 mr-2">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            Learning
          </div>
        )}

        <button
          onClick={() => router.push("/copilot")}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-xs font-semibold transition-colors"
        >
          Open Copilot
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6h7M6.5 3l3 3-3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      {/* ── Stats strip ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-8 px-6 py-3.5 border-b border-white/[0.06] bg-[#0d0d0d] overflow-x-auto">
        {isLoading ? (
          /* Skeleton loader for stats strip */
          <>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="flex flex-col gap-1.5 flex-shrink-0">
                <div className="h-2 w-12 rounded bg-white/[0.06] animate-pulse" />
                <div className="h-5 w-8 rounded bg-white/[0.08] animate-pulse" />
              </div>
            ))}
          </>
        ) : (
          <>
            <Stat
              label="Brain IQ"
              value={String(rlStatus?.brainIq ?? 0)}
              accent="blue"
            />
            <StatDivider />
            <Stat
              label="Signals (24h)"
              value={String(rlStatus?.totalSignals24h ?? 0)}
              accent="emerald"
            />
            <Stat
              label="This Hour"
              value={String(rlStatus?.signalsThisHour ?? 0)}
              accent="emerald"
              dim
            />
            <StatDivider />
            <Stat
              label="Running"
              value={String(workerHealth?.runningJobs ?? 0)}
              accent={workerHealth?.runningJobs ? "blue" : "gray"}
            />
            <Stat
              label="Pending"
              value={String(workerHealth?.pendingJobs ?? 0)}
              accent="yellow"
              dim
            />
            <Stat
              label="Done (1h)"
              value={String(workerHealth?.succeededLast1h ?? 0)}
              accent="emerald"
              dim
            />
            <Stat
              label="Failed (1h)"
              value={String(workerHealth?.failedLast1h ?? 0)}
              accent={workerHealth?.failedLast1h ? "red" : "gray"}
              dim
            />
            <StatDivider />
            <Stat
              label="Connectors"
              value={`${connectedCount}/${connectors.length || 0}`}
              accent={connectedCount > 0 ? "emerald" : "gray"}
            />
          </>
        )}
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left: Live Agent Activity (60%) */}
        <div className="flex-[3] overflow-y-auto border-r border-white/[0.06]">
          <div className="p-6">
            {/* Skeleton while initial load */}
            {isLoading && recentJobs.length === 0 && (
              <div className="space-y-2">
                <SectionLabel>Recent Jobs</SectionLabel>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/[0.06] animate-pulse flex-shrink-0" />
                    <div className="h-3 flex-1 rounded bg-white/[0.06] animate-pulse" />
                    <div className="h-3 w-12 rounded bg-white/[0.04] animate-pulse" />
                    <div className="h-3 w-6 rounded bg-white/[0.04] animate-pulse" />
                  </div>
                ))}
              </div>
            )}

            {/* Active now */}
            {!isLoading && runningJobs.length > 0 && (
              <div className="mb-6">
                <SectionLabel>Active Now</SectionLabel>
                <div className="space-y-2">
                  {runningJobs.map((job) => (
                    <JobRow key={job.id} job={job} />
                  ))}
                </div>
              </div>
            )}

            {/* Queue summary */}
            {(workerHealth?.pendingJobs ?? 0) > 0 && (
              <div className="mb-6 px-4 py-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                <span className="text-sm text-yellow-400/80">
                  {workerHealth?.pendingJobs} job
                  {workerHealth?.pendingJobs !== 1 ? "s" : ""} queued
                </span>
              </div>
            )}

            {/* Recent jobs — only shown after initial load completes */}
            {!isLoading && <div>
              <SectionLabel>Recent Jobs</SectionLabel>
              {doneJobs.length === 0 && runningJobs.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      className="text-white/20"
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
                  </div>
                  <p className="text-sm text-white/25">No recent jobs</p>
                  <p className="text-xs text-white/15 mt-1">
                    Run a query in Copilot to see activity here
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {doneJobs.slice(0, 12).map((job) => (
                    <JobRow key={job.id} job={job} />
                  ))}
                </div>
              )}
            </div>}
          </div>
        </div>

        {/* Right: Brain Intelligence (40%) */}
        <div className="flex-[2] overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Brain IQ card */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
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
                /* Skeleton for Brain IQ card */
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
                    <span className="text-sm text-white/30 mb-1.5">IQ</span>
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
                      value={`${Math.round((rlStatus?.improvementThisSession ?? 0) * 100)}%`}
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

            {/* Knowledge Tiers */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
              <div className="flex items-center justify-between mb-4">
                <SectionLabel>Knowledge Tiers</SectionLabel>
              </div>

              <div className="space-y-2.5">
                {/* Tier 1 */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03]">
                  <div className="w-5 h-5 rounded flex items-center justify-center bg-accent/15 flex-shrink-0">
                    <span className="text-[9px] font-bold text-accent">T1</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/60">Raw Knowledge</p>
                    <p className="text-[10px] text-white/25">knowledge_chunks</p>
                  </div>
                  <span className="text-sm font-bold text-accent">
                    {tierStats ? tierStats.tier1Count.toLocaleString() : "—"}
                  </span>
                </div>

                {/* Tier 2 */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03]">
                  <div className="w-5 h-5 rounded flex items-center justify-center bg-purple-500/15 flex-shrink-0">
                    <span className="text-[9px] font-bold text-purple-400">T2</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/60">Signals (24h)</p>
                    <p className="text-[10px] text-white/25">cross_domain_signals</p>
                  </div>
                  <span className="text-sm font-bold text-purple-400">
                    {tierStats ? tierStats.tier2Count.toLocaleString() : "—"}
                  </span>
                </div>

                {/* Tier 3 */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03]">
                  <div className="w-5 h-5 rounded flex items-center justify-center bg-success/15 flex-shrink-0">
                    <span className="text-[9px] font-bold text-success">T3</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/60">Consolidated</p>
                    <p className="text-[10px] text-white/25">consolidated_patterns</p>
                  </div>
                  <span className="text-sm font-bold text-success">
                    {tierStats ? tierStats.tier3Count.toLocaleString() : "—"}
                  </span>
                </div>
              </div>

              {/* Run Consolidation button */}
              <div className="mt-4">
                {consolidationMsg ? (
                  <p className="text-xs text-success/80 text-center py-2">
                    {consolidationMsg}
                  </p>
                ) : (
                  <button
                    onClick={runConsolidation}
                    disabled={isConsolidating}
                    className="w-full py-2 rounded-lg border border-white/10 text-xs text-white/40 hover:border-success/30 hover:text-success/70 hover:bg-success/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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

            {/* Connectors */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <SectionLabel>Connectors</SectionLabel>
                <button
                  onClick={() => router.push("/connectors")}
                  className="text-[11px] text-white/25 hover:text-white/50 transition-colors"
                >
                  Manage →
                </button>
              </div>
              {connectors.length === 0 ? (
                <button
                  onClick={() => router.push("/connectors")}
                  className="w-full py-4 rounded-lg border border-dashed border-white/10 text-xs text-white/25 hover:border-orange-500/30 hover:text-orange-400/50 transition-colors text-center"
                >
                  + Connect GitHub, Jira, Slack
                </button>
              ) : (
                <div className="space-y-1.5">
                  {connectors.map((c) => {
                    const connected =
                      c.status === "active" || c.status === "syncing";
                    return (
                      <div
                        key={c.connector_type}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.03]"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            connected ? "bg-success" : "bg-white/15"
                          }`}
                        />
                        <span className="text-sm text-white/60 capitalize flex-1">
                          {c.connector_type}
                        </span>
                        {c.last_sync_at && connected && (
                          <span className="text-[11px] text-white/20">
                            {timeAgo(c.last_sync_at)} ago
                          </span>
                        )}
                        {!connected && (
                          <span className="text-[11px] text-danger/60">
                            {c.status}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function JobRow({ job }: { job: AgentJob }) {
  const dotClass = STATUS_DOT[job.status] ?? "bg-white/20";
  const textClass = STATUS_TEXT[job.status] ?? "text-white/40";
  const displayName =
    job.task_type
      ?.replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) ?? "Unknown";

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors group">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
      <span className="text-sm text-white/70 flex-1 truncate">{displayName}</span>
      <span className={`text-xs ${textClass}`}>{job.status}</span>
      <span className="text-xs text-white/20 group-hover:text-white/30 transition-colors">
        {timeAgo(job.created_at)}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  dim,
}: {
  label: string;
  value: string;
  accent: string;
  dim?: boolean;
}) {
  const accentColors: Record<string, string> = {
    blue: "text-accent",
    emerald: "text-success",
    purple: "text-purple-400",
    yellow: "text-warning",
    red: "text-danger",
    orange: "text-orange-400",
    gray: "text-white/25",
  };
  return (
    <div
      className={`flex flex-col gap-0.5 flex-shrink-0 ${dim ? "opacity-60" : ""}`}
    >
      <span className="text-[10px] font-medium uppercase tracking-widest text-white/25">
        {label}
      </span>
      <span
        className={`text-lg font-bold ${accentColors[accent] ?? "text-white"}`}
      >
        {value}
      </span>
    </div>
  );
}

function StatDivider() {
  return <div className="w-px h-7 bg-white/[0.06] flex-shrink-0" />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-3">
      {children}
    </p>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/35 text-xs">{label}</span>
      <span className="text-white/70 text-xs font-medium">{value}</span>
    </div>
  );
}
