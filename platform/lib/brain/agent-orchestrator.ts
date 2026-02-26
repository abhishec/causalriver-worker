/**
 * Agent Orchestrator
 * ==================
 * Smart command center for AI worker agents.
 *
 * Solves the core problem: when a P0 SE-aaS task (e.g. delivery-intelligence)
 * is requested while a brain-population agent is still running, the orchestrator:
 *  1. Detects the dependency
 *  2. Queues the P0 task with status='waiting'
 *  3. Returns a human-readable message to the Copilot UI
 *  4. Auto-starts the P0 task once brain-population completes
 *
 * Integration points:
 *  - job-worker.ts calls checkAndStartWaitingJobs() after every job completion
 *  - chat/route.ts calls orchestrateJob() before executing any SE-aaS domain
 *  - /api/brain/orchestrator route exposes state + orchestration to the UI
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getOrCreateAIWorkspace } from "@/lib/brain/ai-workspace";

// ── Constants ────────────────────────────────────────────────────────────────

/** SE-aaS delivery domains that require brain data to produce meaningful results */
export const BRAIN_DEPENDENT_DOMAINS = new Set([
  "pod-match",
  "delivery-intelligence",
  "early-warning",
  "scope-creep",
]);

/** Task types that populate the brain (block delivery domains until done) */
export const BRAIN_POPULATION_TYPES = new Set([
  "brain-population",
  "connector-sync",
  "github-ingest",
  "jira-ingest",
  "full-sync",
]);

/** Fallback minimum total_predictions if workspace config cannot be read */
const BRAIN_READY_THRESHOLD_DEFAULT = 10;

// ── Types ────────────────────────────────────────────────────────────────────

export interface OrchestratorDecision {
  action: "execute-now" | "queue-waiting" | "reject";
  reason: string;
  estimatedWaitMs?: number;
  blockingJobId?: string;
  blockingJobType?: string;
  queuePosition?: number;
}

export interface RunningJob {
  id: string;
  taskType: string;
  startedAt: string;
}

export interface PendingJob {
  id: string;
  taskType: string;
  createdAt: string;
}

export interface WaitingEntry {
  jobId: string;
  dependsOnJobId: string;
  dependsOnType: string;
  createdAt: string;
}

export interface OrgAgentState {
  runningJobs: RunningJob[];
  pendingJobs: PendingJob[];
  /** Is a brain-population / connector-sync agent currently running? */
  brainPopulationRunning: boolean;
  brainPopulationJobId?: string;
  /** empty = no brain data at all | populating = job running | ready = enough signals */
  brainReadiness: "empty" | "populating" | "ready";
  /** Brain signal count from brain_evolution_snapshots */
  brainSignalCount: number;
  waitingJobs: WaitingEntry[];
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function adminClient(): SupabaseClient<any, any, any> {
  return getAdminClient();
}

/** Estimate elapsed ms since a job started based on its started_at timestamp */
function elapsedMsSince(startedAt: string): number {
  return Date.now() - new Date(startedAt).getTime();
}

/** Rough brain-population job duration estimate: 3 minutes */
const BRAIN_POP_AVG_DURATION_MS = 3 * 60 * 1000;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Snapshot the full agent + brain state for an organisation.
 *
 * Queries:
 *  - agent_queue for running + pending jobs
 *  - agent_orchestration for waiting entries
 *  - brain_evolution_snapshots for total signal count (brain readiness)
 */
export async function getOrgAgentState(orgId: string): Promise<OrgAgentState> {
  const supabase = adminClient();

  // Load workspace config to get the IQ threshold (runs concurrently with other queries)
  const workspacePromise = getOrCreateAIWorkspace(orgId);

  // Load Brain IQ from ai_workspace.orchestrator_config (same source as brain-context.ts)
  const brainIqPromise: Promise<number> = Promise.resolve(
    adminClient()
      .from("ai_workspace")
      .select("orchestrator_config")
      .eq("organization_id", orgId)
      .maybeSingle()
  ).then(({ data }) => {
    const config = (data?.orchestrator_config as Record<string, unknown>) ?? {};
    return typeof config.brainIq === "number" ? config.brainIq : 0;
  }).catch(() => 0); // non-fatal — default to 0 if unavailable

  // Parallel queries for efficiency
  const [runningRes, pendingRes, waitingRes, brainRes] = await Promise.all([
    // Running jobs for this org
    supabase
      .from("agent_queue")
      .select("id, task_type, started_at")
      .eq("organization_id", orgId)
      .eq("status", "running")
      .order("started_at", { ascending: true })
      .limit(20),

    // Pending (queued, not yet started) jobs for this org
    supabase
      .from("agent_queue")
      .select("id, task_type, created_at")
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(20),

    // Waiting orchestration entries for this org
    supabase
      .from("agent_orchestration")
      .select("job_id, depends_on_job_id, depends_on_type, created_at")
      .eq("organization_id", orgId)
      .eq("status", "waiting")
      .order("created_at", { ascending: true })
      .limit(20),

    // Brain readiness: sum of total_predictions across all snapshots
    supabase
      .from("brain_evolution_snapshots")
      .select("total_predictions")
      .eq("organization_id", orgId)
      .order("snapshot_date", { ascending: false })
      .limit(30),
  ]);

  const runningJobs: RunningJob[] = (runningRes.data ?? []).map((j) => ({
    id: j.id,
    taskType: j.task_type,
    startedAt: j.started_at ?? new Date().toISOString(),
  }));

  const pendingJobs: PendingJob[] = (pendingRes.data ?? []).map((j) => ({
    id: j.id,
    taskType: j.task_type,
    createdAt: j.created_at ?? new Date().toISOString(),
  }));

  const waitingJobs: WaitingEntry[] = (waitingRes.data ?? []).map((w) => ({
    jobId: w.job_id,
    dependsOnJobId: w.depends_on_job_id,
    dependsOnType: w.depends_on_type,
    createdAt: w.created_at ?? new Date().toISOString(),
  }));

  // Brain signal count
  const snapshots = brainRes.data ?? [];
  const brainSignalCount = snapshots.reduce(
    (sum, s) => sum + (s.total_predictions ?? 0),
    0
  );

  // Resolve workspace config (may have been started concurrently above)
  const [workspace, brainIq] = await Promise.all([workspacePromise, brainIqPromise]);
  const brainReadyThreshold =
    workspace.orchestratorConfig.brainReadinessMinIq ?? BRAIN_READY_THRESHOLD_DEFAULT;

  /** Minimum viable Brain IQ for declaring brain "ready" */
  const BRAIN_IQ_MIN_VIABLE = 10;

  // Find running brain-population job (if any)
  const brainPopJob = runningJobs.find((j) =>
    BRAIN_POPULATION_TYPES.has(j.taskType)
  );
  const brainPopulationRunning = !!brainPopJob;
  const brainPopulationJobId = brainPopJob?.id;

  // Brain readiness — BOTH conditions must be met:
  // 1. signal_count >= threshold  (enough data)
  // 2. brainIq >= BRAIN_IQ_MIN_VIABLE  (minimum viable intelligence)
  let brainReadiness: OrgAgentState["brainReadiness"];
  if (brainSignalCount === 0) {
    brainReadiness = "empty";
  } else if (
    brainSignalCount < brainReadyThreshold ||
    brainIq < BRAIN_IQ_MIN_VIABLE ||
    brainPopulationRunning
  ) {
    brainReadiness = "populating";
  } else {
    brainReadiness = "ready";
  }

  return {
    runningJobs,
    pendingJobs,
    brainPopulationRunning,
    brainPopulationJobId,
    brainReadiness,
    brainSignalCount,
    waitingJobs,
  };
}

/**
 * Decide whether to execute a job now, queue it as waiting, or reject it.
 *
 * Decision matrix:
 *  - Brain-dependent domain + brain 'empty'       → queue-waiting (depends on brain-population)
 *  - Brain-dependent domain + brain 'populating'  → queue-waiting (depends on active brain-pop job)
 *  - brain-population task already running        → reject (idempotent — no double-population)
 *  - Otherwise                                    → execute-now
 */
export async function orchestrateJob(params: {
  orgId: string;
  taskType: string;
  payload: Record<string, unknown>;
  priority?: "high" | "normal" | "low";
}): Promise<OrchestratorDecision> {
  const state = await getOrgAgentState(params.orgId);

  // Rule 1: Prevent duplicate brain-population jobs
  if (BRAIN_POPULATION_TYPES.has(params.taskType) && state.brainPopulationRunning) {
    return {
      action: "reject",
      reason: `Brain population is already in progress (job ${state.brainPopulationJobId}). Wait for it to complete before starting another.`,
      blockingJobId: state.brainPopulationJobId,
      blockingJobType: "brain-population",
    };
  }

  // Rule 2: Brain-dependent domain — brain is empty (no data at all)
  if (BRAIN_DEPENDENT_DOMAINS.has(params.taskType) && state.brainReadiness === "empty") {
    return {
      action: "queue-waiting",
      reason:
        "Brain has no data yet. This analysis will auto-start once a brain-population agent runs and loads your GitHub/Jira data.",
      estimatedWaitMs: BRAIN_POP_AVG_DURATION_MS,
      blockingJobType: "brain-population",
    };
  }

  // Rule 3: Brain-dependent domain — brain is actively populating (job running)
  if (
    BRAIN_DEPENDENT_DOMAINS.has(params.taskType) &&
    state.brainReadiness === "populating" &&
    state.brainPopulationRunning &&
    state.brainPopulationJobId
  ) {
    const runningJob = state.runningJobs.find(
      (j) => j.id === state.brainPopulationJobId
    );
    const elapsed = runningJob
      ? elapsedMsSince(runningJob.startedAt)
      : 0;
    const remainingMs = Math.max(0, BRAIN_POP_AVG_DURATION_MS - elapsed);

    return {
      action: "queue-waiting",
      reason: `Brain population is in progress (job ${state.brainPopulationJobId}). This analysis will auto-start once it finishes.`,
      estimatedWaitMs: remainingMs,
      blockingJobId: state.brainPopulationJobId,
      blockingJobType: "brain-population",
      queuePosition: state.pendingJobs.length + 1,
    };
  }

  // Default: safe to execute immediately
  return {
    action: "execute-now",
    reason: `Brain is ${state.brainReadiness} with ${state.brainSignalCount} signal(s). Ready to execute ${params.taskType}.`,
  };
}

/**
 * Register a dependency between two jobs in agent_orchestration.
 * Called immediately after inserting the blocked job to agent_queue.
 */
export async function registerDependency(params: {
  orgId: string;
  jobId: string;
  dependsOnJobId?: string;   // undefined when brain isn't populated yet (no specific job to depend on)
  dependsOnType: string;
  autoStart?: boolean;
}): Promise<void> {
  const supabase = adminClient();

  const { error } = await supabase.from("agent_orchestration").insert({
    organization_id: params.orgId,
    job_id: params.jobId,
    depends_on_job_id: params.dependsOnJobId ?? null,
    depends_on_type: params.dependsOnType,
    status: "waiting",
    auto_start: params.autoStart ?? true,
  });

  if (error) {
    logger.warn("[orchestrator] registerDependency failed:", error.message);
    // Non-fatal — job is still in agent_queue with status='pending'
  }
}

/**
 * Called when a job completes (success or error).
 * Finds all jobs waiting on this job, marks them 'ready', and starts them.
 *
 * Returns the IDs of newly started jobs.
 *
 * Fire-and-forget safe — callers should .catch(() => {}) this.
 */
export async function checkAndStartWaitingJobs(
  orgId: string,
  completedJobId: string
): Promise<string[]> {
  const supabase = adminClient();

  // Find all waiting entries that depend on this completed job.
  // created_at is fetched to compute wait_duration_ms for RL signal emission.
  const { data: waitingEntries, error: fetchErr } = await supabase
    .from("agent_orchestration")
    .select("id, job_id, depends_on_type, auto_start, created_at")
    .eq("depends_on_job_id", completedJobId)
    .eq("status", "waiting");

  if (fetchErr || !waitingEntries || waitingEntries.length === 0) {
    if (fetchErr) {
      logger.warn(
        "[orchestrator] checkAndStartWaitingJobs fetch failed:",
        fetchErr.message
      );
    }
    return [];
  }

  const startedJobIds: string[] = [];

  for (const entry of waitingEntries) {
    if (!entry.auto_start) {
      // Mark ready but don't auto-start
      await supabase
        .from("agent_orchestration")
        .update({ status: "ready", resolved_at: new Date().toISOString() })
        .eq("id", entry.id);
      continue;
    }

    try {
      // Move the blocked job from 'waiting' status to 'pending' in agent_queue
      // so the job worker picks it up on next poll cycle
      const { error: updateJobErr } = await supabase
        .from("agent_queue")
        .update({ status: "pending" })
        .eq("id", entry.job_id)
        .eq("organization_id", orgId);

      if (updateJobErr) {
        logger.warn(
          `[orchestrator] Failed to unblock job ${entry.job_id}:`,
          updateJobErr.message
        );
        continue;
      }

      // Mark orchestration entry as started
      await supabase
        .from("agent_orchestration")
        .update({ status: "started", resolved_at: new Date().toISOString() })
        .eq("id", entry.id);

      startedJobIds.push(entry.job_id);
      logger.warn(
        `[orchestrator] Auto-started job ${entry.job_id} (was waiting on ${completedJobId})`
      );

      // ── RL signal: teach brain whether the readiness threshold was calibrated well ──
      // dopamine (<30s): fast unblock — threshold is well-calibrated
      // serotonin (30s–5min): neutral, acceptable wait
      // gaba (>5min): slow unblock — threshold may be too conservative
      const waitDurationMs: number = entry.created_at
        ? Date.now() - new Date(entry.created_at as string).getTime()
        : 0;

      const signalType: string =
        waitDurationMs < 30_000
          ? "dopamine"
          : waitDurationMs < 300_000
            ? "serotonin"
            : "gaba";

      const signalStrength: number =
        waitDurationMs < 30_000
          ? 0.2
          : waitDurationMs < 300_000
            ? 0.0
            : -0.3;

      // Fire-and-forget — RL must never crash orchestration
      void Promise.resolve(
        supabase
          .from("cross_domain_signals")
          .insert({
            organization_id: orgId,
            source_domain: "orchestrator",
            target_domain: (entry.depends_on_type as string) ?? "unknown",
            signal_type: signalType,
            signal_strength: signalStrength,
            signal_timestamp: new Date().toISOString(),
            payload: {
              reason: "job_unblocked",
              wait_duration_ms: waitDurationMs,
              blocking_job_id: completedJobId,
              unblocked_job_id: entry.job_id,
            },
            created_at: new Date().toISOString(),
          })
      ).catch(() => {});
    } catch (err: any) {
      logger.warn(
        `[orchestrator] Error starting waiting job ${entry.job_id}:`,
        err?.message
      );
    }
  }

  return startedJobIds;
}

/**
 * Also handles the case where brain-population-dependent jobs have no specific
 * blocking job ID (brain was just completely empty). Called by the brain
 * population job worker after a successful completion to unblock any orphaned
 * waiting jobs that depend on 'brain-population' type generically.
 */
export async function checkAndStartBrainDependentJobs(
  orgId: string
): Promise<string[]> {
  const supabase = adminClient();

  // Find waiting jobs that depend on brain-population type but have no specific job ID.
  // created_at is fetched to compute wait_duration_ms for RL signal emission.
  const { data: orphanEntries, error: fetchErr } = await supabase
    .from("agent_orchestration")
    .select("id, job_id, auto_start, created_at")
    .eq("organization_id", orgId)
    .eq("depends_on_type", "brain-population")
    .eq("status", "waiting")
    .is("depends_on_job_id", null);

  if (fetchErr || !orphanEntries || orphanEntries.length === 0) {
    return [];
  }

  const startedJobIds: string[] = [];

  for (const entry of orphanEntries) {
    if (!entry.auto_start) {
      await supabase
        .from("agent_orchestration")
        .update({ status: "ready", resolved_at: new Date().toISOString() })
        .eq("id", entry.id);
      continue;
    }

    try {
      const { error: updateErr } = await supabase
        .from("agent_queue")
        .update({ status: "pending" })
        .eq("id", entry.job_id)
        .eq("organization_id", orgId);

      if (updateErr) continue;

      await supabase
        .from("agent_orchestration")
        .update({ status: "started", resolved_at: new Date().toISOString() })
        .eq("id", entry.id);

      startedJobIds.push(entry.job_id);
      logger.warn(
        `[orchestrator] Auto-started brain-dependent job ${entry.job_id} (brain now populated)`
      );

      // ── RL signal: teach brain whether the readiness threshold was calibrated well ──
      const waitDurationMs: number = entry.created_at
        ? Date.now() - new Date(entry.created_at as string).getTime()
        : 0;

      const signalType: string =
        waitDurationMs < 30_000
          ? "dopamine"
          : waitDurationMs < 300_000
            ? "serotonin"
            : "gaba";

      const signalStrength: number =
        waitDurationMs < 30_000 ? 0.2 : waitDurationMs < 300_000 ? 0.0 : -0.3;

      // Fire-and-forget — RL must never crash orchestration
      void Promise.resolve(
        supabase
          .from("cross_domain_signals")
          .insert({
            organization_id: orgId,
            source_domain: "orchestrator",
            target_domain: "brain-population",
            signal_type: signalType,
            signal_strength: signalStrength,
            signal_timestamp: new Date().toISOString(),
            payload: {
              reason: "brain_dependent_job_unblocked",
              wait_duration_ms: waitDurationMs,
              unblocked_job_id: entry.job_id,
            },
            created_at: new Date().toISOString(),
          })
      ).catch(() => {});
    } catch (err: any) {
      logger.warn(
        `[orchestrator] Error starting brain-dependent job ${entry.job_id}:`,
        err?.message
      );
    }
  }

  return startedJobIds;
}

/**
 * Format the orchestrator decision into a human-readable Copilot message.
 *
 * Designed to be injected into the SSE text stream so the user sees it
 * immediately in the chat UI.
 */
export function formatOrchestratorMessage(
  decision: OrchestratorDecision,
  state: OrgAgentState
): string {
  switch (decision.action) {
    case "execute-now":
      if (state.brainSignalCount > 0) {
        return `Starting analysis now. Brain is ready with ${state.brainSignalCount} signal(s) loaded.`;
      }
      return "Starting analysis now.";

    case "queue-waiting": {
      const waitMin = decision.estimatedWaitMs
        ? Math.ceil(decision.estimatedWaitMs / 60_000)
        : null;
      const etaStr = waitMin ? ` (~${waitMin} min remaining)` : "";

      if (decision.blockingJobId) {
        return (
          `I've queued this analysis — it will auto-start once the ${decision.blockingJobType ?? "blocking"} agent finishes${etaStr}. ` +
          `You can track progress in the Agent Monitor.`
        );
      }

      // Brain is empty — no specific blocking job
      return (
        `I've queued this analysis. It requires brain data that hasn't been loaded yet. ` +
        `Start a brain-population agent (connect GitHub or Jira) and this will auto-start once the brain is ready.`
      );
    }

    case "reject":
      return `Cannot start this task: ${decision.reason}`;

    default:
      return "Task queued.";
  }
}
