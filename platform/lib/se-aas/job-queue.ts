/**
 * SE-aaS Job Queue Manager
 * =========================
 * Uses the existing `agent_queue` table for async job tracking
 * and `se_aas_artifacts` table for persisting domain execution results.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { checkAndStartWaitingJobs } from "@/lib/brain/agent-orchestrator";

// ============================================================================
// TYPES
// ============================================================================

export interface SubmitJobParams {
  organizationId: string;
  domainType: string;
  /** The domain request payload. Use `payload` or `request` — both are accepted. */
  payload?: Record<string, unknown>;
  /** Alias for `payload` — accepted by newer route files */
  request?: Record<string, unknown>;
  userId: string;
  /** Anthropic API key to include in the job payload for Claude-powered domains */
  anthropicApiKey?: string;
  priority?: number;
  /** Week 7: Domain weight classification for priority scheduling */
  weight?: "light" | "heavy";
}

export interface JobStatus {
  jobId: string;
  status: "pending" | "running" | "success" | "error";
  result?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface SaveArtifactParams {
  organizationId: string;
  jobId?: string;
  domainType: string;
  artifactData: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

export interface ArtifactRecord {
  id: string;
  organization_id: string;
  job_id: string | null;
  domain_type: string;
  artifact_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface ListArtifactsParams {
  domainType?: string;
  conversationId?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// JOB SUBMISSION
// ============================================================================

/**
 * Submit an async SE-aaS job to the agent_queue.
 */
export async function submitSeAaSJob(
  supabase: SupabaseClient,
  params: SubmitJobParams
): Promise<{ jobId: string }> {
  // Support both `payload` and `request` aliases
  const domainPayload = params.payload ?? params.request ?? {};

  const { data, error } = await supabase
    .from("agent_queue")
    .insert({
      organization_id: params.organizationId,
      agent_type: "se-aas",
      task_type: params.domainType,
      priority: params.priority ?? 5,
      payload: {
        ...domainPayload,
        userId: params.userId,
        ...(params.anthropicApiKey ? { anthropicApiKey: params.anthropicApiKey } : {}),
        ...(params.weight ? { weight: params.weight } : {}),
      },
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to submit job: ${error?.message || "no data"}`);
  }

  return { jobId: data.id };
}

// ============================================================================
// JOB STATUS
// ============================================================================

/**
 * Get the status of an SE-aaS job.
 */
export async function getJobStatus(
  supabase: SupabaseClient,
  jobId: string,
  organizationId: string
): Promise<JobStatus | null> {
  const { data, error } = await supabase
    .from("agent_queue")
    .select("id, status, result, error_message, created_at, started_at, completed_at")
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    jobId: data.id,
    status: data.status,
    result: data.result ?? undefined,
    error: data.error_message ?? undefined,
    createdAt: data.created_at,
    startedAt: data.started_at ?? undefined,
    completedAt: data.completed_at ?? undefined,
  };
}

// ============================================================================
// JOB EXECUTION
// ============================================================================

/**
 * Claim and execute a pending job, then update its status.
 * After the job completes (success or error), automatically unblocks any jobs
 * that were waiting on this job via checkAndStartWaitingJobs.
 */
export async function executeAndCompleteJob(
  supabase: SupabaseClient,
  jobId: string,
  executor: () => Promise<Record<string, unknown>>
): Promise<void> {
  // Claim the job (also read organization_id for orchestration)
  const { data: jobRow, error: claimError } = await supabase
    .from("agent_queue")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("organization_id")
    .maybeSingle();

  if (claimError) {
    throw new Error(`Failed to claim job: ${claimError.message}`);
  }

  const orgId: string | undefined = jobRow?.organization_id ?? undefined;

  try {
    const result = await executor();

    await supabase
      .from("agent_queue")
      .update({
        status: "success",
        result,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch (err: any) {
    logger.error(`[SE-aaS JobWorker] Job ${jobId} failed:`, err?.message || err);
    await supabase
      .from("agent_queue")
      .update({
        status: "error",
        error_message: "Job execution failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } finally {
    // Auto-start any jobs that were waiting on this job.
    // Fire-and-forget — never let this block the caller.
    if (orgId) {
      checkAndStartWaitingJobs(orgId, jobId).catch((err) => {
        logger.warn("[job-queue] checkAndStartWaitingJobs failed", { jobId, err });
      });
    }
  }
}

// ============================================================================
// ARTIFACT PERSISTENCE
// ============================================================================

/**
 * Save an SE-aaS artifact after domain execution.
 */
export async function saveArtifact(
  supabase: SupabaseClient,
  params: SaveArtifactParams
): Promise<{ artifactId: string }> {
  const payload = {
    organization_id: params.organizationId,
    job_id: params.jobId ?? null,
    domain_type: params.domainType,
    artifact_data: params.artifactData,
    metadata: params.metadata ?? {},
    created_by: params.createdBy ?? null,
  };

  // Attempt 1
  const { data, error } = await supabase
    .from("se_aas_artifacts")
    .insert(payload)
    .select("id")
    .single();

  if (!error && data) {
    return { artifactId: data.id };
  }

  // Retry once after 1 second (handles transient DB hiccups)
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  const { data: retryData, error: retryError } = await supabase
    .from("se_aas_artifacts")
    .insert(payload)
    .select("id")
    .single();

  if (retryError || !retryData) {
    throw new Error(`Failed to save artifact (after retry): ${retryError?.message || "no data"}`);
  }

  logger.info(`[saveArtifact] Saved on retry for job ${params.jobId ?? "none"}`);
  return { artifactId: retryData.id };
}

/**
 * Retrieve a single artifact by ID.
 */
export async function getArtifact(
  supabase: SupabaseClient,
  artifactId: string,
  organizationId: string
): Promise<ArtifactRecord | null> {
  const { data, error } = await supabase
    .from("se_aas_artifacts")
    .select("*")
    .eq("id", artifactId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ArtifactRecord;
}

/**
 * List artifacts for an organization.
 */
export async function listArtifacts(
  supabase: SupabaseClient,
  organizationId: string,
  params: ListArtifactsParams = {}
): Promise<{ artifacts: ArtifactRecord[]; total: number }> {
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = params.offset ?? 0;

  let query = supabase
    .from("se_aas_artifacts")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.domainType) {
    query = query.eq("domain_type", params.domainType);
  }

  // Note: se_aas_artifacts links to jobs via job_id, not conversation_id.
  // The conversationId filter is a no-op to avoid querying a non-existent column.
  // Artifacts are fetched by org and optionally filtered by domainType.

  const { data, error, count } = await query;

  if (error) {
    throw new Error("Failed to list artifacts");
  }

  return {
    artifacts: (data || []) as ArtifactRecord[],
    total: count ?? 0,
  };
}
