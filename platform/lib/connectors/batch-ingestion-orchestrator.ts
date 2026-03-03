/**
 * Batch Ingestion Orchestrator (ADR-029)
 * =======================================
 *
 * Wraps the existing ingestDocument() for batch operations with:
 * - Progress tracking to ingestion_jobs table
 * - Lambda-safe chunked execution (5 docs per batch, 25s guard)
 * - Checkpoint/resume (if Lambda dies mid-batch, next cron tick resumes)
 * - Error logging per document (non-fatal, continues on failure)
 *
 * Called by: /api/cron/process-ingestion cron route
 * Reuses:   ingestDocument() from document-ingester.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { ingestDocument } from "@/lib/connectors/document-ingester";
import type { IngestDocumentParams } from "@/lib/connectors/document-ingester";

/** Maximum documents to process per cron tick (Lambda-safe) */
const BATCH_SIZE = 5;
/** Safety timeout — stop processing if we're near Lambda limit */
const LAMBDA_TIMEOUT_MS = 25_000;

export interface IngestionJob {
  id: string;
  organization_id: string;
  ai_worker_id: string | null;
  connector_type: string;
  status: string;
  total_documents: number;
  processed_documents: number;
  failed_documents: number;
  total_chunks_created: number;
  source_config: Record<string, unknown>;
  error_log: Array<{ documentTitle: string; error: string; timestamp: string }>;
  checkpoint: Record<string, unknown>;
}

export interface BatchResult {
  processed: number;
  remaining: number;
  chunksCreated: number;
  failed: number;
  completed: boolean;
}

export interface DocumentToIngest {
  title: string;
  content: string;
  sourceUrl?: string;
  sourceType: IngestDocumentParams["sourceType"];
  metadata?: Record<string, unknown>;
}

/**
 * Process the next batch of documents for an ingestion job.
 *
 * Flow:
 * 1. Read the job from ingestion_jobs (validates it's running)
 * 2. Fetch the next batch of documents from the connector
 * 3. For each document, call ingestDocument()
 * 4. Update progress counters and checkpoint
 * 5. If all done, mark job as completed
 *
 * Lambda-safe: processes up to BATCH_SIZE documents, then returns.
 * The cron route calls this repeatedly until the job completes.
 */
export async function processBatchIngestion(
  supabase: SupabaseClient,
  jobId: string,
  fetchDocuments: (
    job: IngestionJob,
    offset: number,
    limit: number,
  ) => Promise<{ documents: DocumentToIngest[]; totalAvailable: number }>,
): Promise<BatchResult> {
  const startTime = Date.now();

  // 1. Load the job
  const { data: job, error: jobErr } = await supabase
    .from("ingestion_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    logger.warn("[batch-ingestion] Job not found", { jobId, error: jobErr?.message });
    return { processed: 0, remaining: 0, chunksCreated: 0, failed: 0, completed: false };
  }

  const ingestionJob = job as IngestionJob;

  // Only process running/pending jobs
  if (!["running", "pending"].includes(ingestionJob.status)) {
    return { processed: 0, remaining: 0, chunksCreated: 0, failed: 0, completed: true };
  }

  // Mark as running if pending
  if (ingestionJob.status === "pending") {
    await supabase
      .from("ingestion_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);
  }

  // 2. Fetch the next batch
  const offset = ingestionJob.processed_documents + ingestionJob.failed_documents;
  const { documents, totalAvailable } = await fetchDocuments(ingestionJob, offset, BATCH_SIZE);

  // Update total_documents if we now know the real count
  if (totalAvailable > 0 && ingestionJob.total_documents !== totalAvailable) {
    await supabase
      .from("ingestion_jobs")
      .update({ total_documents: totalAvailable })
      .eq("id", jobId);
  }

  // No more documents → mark complete
  if (documents.length === 0) {
    await supabase
      .from("ingestion_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return {
      processed: 0,
      remaining: 0,
      chunksCreated: 0,
      failed: 0,
      completed: true,
    };
  }

  // 3. Process each document
  let processed = 0;
  let chunksCreated = 0;
  let failed = 0;
  const errorLog = [...(ingestionJob.error_log || [])];

  for (const doc of documents) {
    // Lambda timeout guard
    if (Date.now() - startTime > LAMBDA_TIMEOUT_MS) {
      logger.warn("[batch-ingestion] Lambda timeout guard triggered, pausing", {
        jobId,
        processed,
        elapsed: Date.now() - startTime,
      });
      break;
    }

    try {
      const result = await ingestDocument(supabase, {
        organizationId: ingestionJob.organization_id,
        sourceUrl: doc.sourceUrl,
        sourceType: doc.sourceType,
        documentTitle: doc.title,
        content: doc.content,
        metadata: {
          ...doc.metadata,
          ingestionJobId: jobId,
          aiWorkerId: ingestionJob.ai_worker_id,
        },
      });

      processed++;
      chunksCreated += result.chunksCreated;
    } catch (err) {
      failed++;
      errorLog.push({
        documentTitle: doc.title,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
      logger.warn("[batch-ingestion] Document ingest failed (continuing)", {
        jobId,
        document: doc.title,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 4. Update progress
  const newProcessed = ingestionJob.processed_documents + processed;
  const newFailed = ingestionJob.failed_documents + failed;
  const newChunks = ingestionJob.total_chunks_created + chunksCreated;
  const remaining = Math.max(0, (totalAvailable || ingestionJob.total_documents) - newProcessed - newFailed);
  const isComplete = remaining === 0;

  await supabase
    .from("ingestion_jobs")
    .update({
      processed_documents: newProcessed,
      failed_documents: newFailed,
      total_chunks_created: newChunks,
      error_log: errorLog.slice(-100), // Keep last 100 errors
      checkpoint: { lastOffset: offset + processed + failed },
      ...(isComplete ? { status: "completed", completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", jobId);

  logger.warn("[batch-ingestion] Batch processed", {
    jobId,
    processed,
    failed,
    chunksCreated,
    remaining,
    elapsed: Date.now() - startTime,
  });

  return { processed, remaining, chunksCreated, failed, completed: isComplete };
}

/**
 * Create a new ingestion job.
 */
export async function createIngestionJob(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    aiWorkerId?: string;
    connectorType: string;
    sourceConfig: Record<string, unknown>;
    createdBy?: string;
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("ingestion_jobs")
    .insert({
      organization_id: params.organizationId,
      ai_worker_id: params.aiWorkerId || null,
      connector_type: params.connectorType,
      source_config: params.sourceConfig,
      status: "pending",
      created_by: params.createdBy || null,
    })
    .select("id")
    .single();

  if (error) {
    logger.warn("[batch-ingestion] Failed to create ingestion job", { error: error.message });
    return null;
  }

  return data?.id ?? null;
}

/**
 * Get pending/running ingestion jobs for processing by cron.
 */
export async function getPendingIngestionJobs(
  supabase: SupabaseClient,
  limit = 3,
): Promise<IngestionJob[]> {
  const { data, error } = await supabase
    .from("ingestion_jobs")
    .select("*")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    logger.warn("[batch-ingestion] Failed to query pending jobs", { error: error.message });
    return [];
  }

  return (data ?? []) as IngestionJob[];
}
