/**
 * Product Analyst Template (ADR-029 Phase 5)
 * ============================================
 * Pre-configured agent session setup for the Product Analyst use case.
 *
 * The Product Analyst agent learns to write in the organization's style by:
 *   1. Ingesting existing PRDs, user stories, specs from Google Drive / Confluence
 *   2. Extracting a writing style profile from that corpus
 *   3. Using few-shot examples accumulated from user-approved outputs
 *
 * This module handles the initialization and readiness check phases.
 * The interactive conversation itself flows through /api/agents/sessions/[id]/turn
 * (which calls executeInteractiveAgent()).
 *
 * Ingestion sources supported:
 *   - Google Drive folder  → connector_type: 'google-drive'
 *   - Confluence space     → connector_type: 'confluence'
 *   - Pre-ingested job IDs → linked directly to corpus document_filter
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { createAgentSession } from "@/lib/agents/session-manager";
import { createIngestionJob } from "@/lib/connectors/batch-ingestion-orchestrator";
import { extractStyleProfile } from "@/lib/agents/style-extractor";
import type { StyleProfile } from "@/lib/agents/style-extractor";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProductAnalystConfig {
  organizationId: string;
  userId: string;
  aiWorkerId?: string;
  sessionName: string;
  // Data sources — at least one should be provided
  ingestionJobIds?: string[];      // already-ingested data (fastest path)
  googleDriveFolderId?: string;    // triggers a new ingestion job
  confluenceSpaceKeys?: string[];  // triggers one ingestion job per space key
}

export interface ProductAnalystSession {
  sessionId: string;
  corpusId: string;
  status: "initializing" | "ingesting" | "analyzing" | "ready" | "error";
  styleProfile?: StyleProfile;
  ingestionJobIds: string[];
  message: string;
}

// ── Internal: ingestion_jobs table row shape ──────────────────────────────────

interface IngestionJobRow {
  id: string;
  status: string;
  processed_documents: number;
  total_documents: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Create a new agent_corpus row linked to the session.
 * Returns the corpus ID on success, null on failure.
 */
async function createCorpus(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    sessionId: string;
    aiWorkerId?: string;
    documentFilter: {
      documentIds?: string[];
      ingestionJobIds?: string[];
      sourceTypes?: string[];
    };
    corpusName: string;
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from("agent_corpus")
    .insert({
      organization_id: params.organizationId,
      agent_session_id: params.sessionId,
      ai_worker_id: params.aiWorkerId ?? null,
      corpus_name: params.corpusName,
      document_filter: params.documentFilter,
      few_shot_examples: [],
      style_profile: null,
      total_documents: 0,
      total_examples: 0,
    })
    .select("id")
    .single();

  if (error || !data) {
    logger.warn("[product-analyst] Failed to create agent_corpus", {
      sessionId: params.sessionId,
      error: error?.message ?? "no data returned",
    });
    return null;
  }

  return data.id as string;
}

/**
 * Create an ingestion job for a Google Drive folder.
 * Returns the job ID on success, null on failure.
 */
async function createGoogleDriveIngestionJob(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    aiWorkerId?: string;
    folderId: string;
    userId: string;
  }
): Promise<string | null> {
  const jobId = await createIngestionJob(supabase, {
    organizationId: params.organizationId,
    aiWorkerId: params.aiWorkerId,
    connectorType: "google-drive",
    sourceConfig: {
      folderId: params.folderId,
      mimeTypes: [
        "application/vnd.google-apps.document",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      recursive: true,
    },
    createdBy: params.userId,
  });

  if (!jobId) {
    logger.warn("[product-analyst] Failed to create Google Drive ingestion job", {
      folderId: params.folderId,
    });
    return null;
  }

  logger.warn("[product-analyst] Google Drive ingestion job created", {
    jobId,
    folderId: params.folderId,
  });

  return jobId;
}

/**
 * Create an ingestion job for a single Confluence space key.
 * Returns the job ID on success, null on failure.
 */
async function createConfluenceIngestionJob(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    aiWorkerId?: string;
    spaceKey: string;
    userId: string;
  }
): Promise<string | null> {
  const jobId = await createIngestionJob(supabase, {
    organizationId: params.organizationId,
    aiWorkerId: params.aiWorkerId,
    connectorType: "confluence",
    sourceConfig: {
      spaceKey: params.spaceKey,
      contentTypes: ["page", "blogpost"],
      includeArchived: false,
    },
    createdBy: params.userId,
  });

  if (!jobId) {
    logger.warn("[product-analyst] Failed to create Confluence ingestion job", {
      spaceKey: params.spaceKey,
    });
    return null;
  }

  logger.warn("[product-analyst] Confluence ingestion job created", {
    jobId,
    spaceKey: params.spaceKey,
  });

  return jobId;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Initialize a Product Analyst agent session.
 *
 * Creates a session + corpus, triggers ingestion for any specified data sources,
 * and extracts a style profile from any already-ingested data.
 *
 * Returns immediately — ingestion continues asynchronously.
 * Use checkProductAnalystReadiness() to poll for completion.
 */
export async function initializeProductAnalyst(
  supabase: SupabaseClient,
  config: ProductAnalystConfig
): Promise<ProductAnalystSession> {
  const {
    organizationId,
    userId,
    aiWorkerId,
    sessionName,
    ingestionJobIds = [],
    googleDriveFolderId,
    confluenceSpaceKeys = [],
  } = config;

  // ── 1. Create agent session ──────────────────────────────────────────────────
  const sessionResult = await createAgentSession(supabase, {
    organizationId,
    aiWorkerId,
    agentType: "product-analyst",
    sessionName,
    knowledgeScope: {
      ingestionJobIds: ingestionJobIds.length > 0 ? ingestionJobIds : undefined,
    },
  });

  if (!sessionResult) {
    logger.warn("[product-analyst] Failed to create agent session", { organizationId });
    return {
      sessionId: "",
      corpusId: "",
      status: "error",
      ingestionJobIds: [],
      message: "Failed to create agent session. Check database connectivity.",
    };
  }

  const sessionId = sessionResult.sessionId;
  logger.warn("[product-analyst] Session created", { sessionId, organizationId });

  // ── 2. Trigger ingestion jobs for new data sources ───────────────────────────
  const newJobIds: string[] = [];

  // Google Drive
  if (googleDriveFolderId) {
    const jobId = await createGoogleDriveIngestionJob(supabase, {
      organizationId,
      aiWorkerId,
      folderId: googleDriveFolderId,
      userId,
    });
    if (jobId) newJobIds.push(jobId);
  }

  // Confluence — one job per space key
  for (const spaceKey of confluenceSpaceKeys) {
    const jobId = await createConfluenceIngestionJob(supabase, {
      organizationId,
      aiWorkerId,
      spaceKey,
      userId,
    });
    if (jobId) newJobIds.push(jobId);
  }

  // Combine pre-existing job IDs with newly created ones
  const allJobIds = [...ingestionJobIds, ...newJobIds];

  // ── 3. Create corpus record ──────────────────────────────────────────────────
  const corpusId = await createCorpus(supabase, {
    organizationId,
    sessionId,
    aiWorkerId,
    corpusName: sessionName,
    documentFilter: {
      ingestionJobIds: allJobIds.length > 0 ? allJobIds : undefined,
    },
  });

  if (!corpusId) {
    return {
      sessionId,
      corpusId: "",
      status: "error",
      ingestionJobIds: allJobIds,
      message: "Session created but failed to create corpus. Retry initialization.",
    };
  }

  logger.warn("[product-analyst] Corpus created", { corpusId, sessionId, jobCount: allJobIds.length });

  // ── 4. Extract style profile from existing ingested data ─────────────────────
  // Only attempt if there are pre-existing job IDs (new jobs haven't processed yet)
  let styleProfile: StyleProfile | undefined;
  let status: ProductAnalystSession["status"] = "ready";
  let message = "Product Analyst ready. No data sources configured.";

  if (allJobIds.length > 0) {
    // Jobs need processing — status is 'ingesting'
    status = "ingesting";
    message = `Ingesting ${allJobIds.length} data source(s). Use checkProductAnalystReadiness() to poll for completion.`;

    // If there were pre-existing job IDs, try extracting a style profile now
    // (new jobs haven't run yet so there may still be relevant chunks)
    if (ingestionJobIds.length > 0) {
      try {
        const profile = await extractStyleProfile(supabase, {
          organizationId,
          corpusId,
          documentFilter: { ingestionJobIds },
          sampleSize: 20,
        });
        if (profile) {
          styleProfile = profile;
          logger.warn("[product-analyst] Preliminary style profile extracted", {
            corpusId,
            tone: profile.tone,
          });
        }
      } catch (err) {
        // Non-fatal — style extraction happens again when ingestion completes
        logger.warn("[product-analyst] Preliminary style extraction failed (non-fatal)", {
          corpusId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (allJobIds.length === 0 && ingestionJobIds.length === 0) {
    // No data sources at all — session is ready but empty corpus
    status = "ready";
    message = "Product Analyst session ready. Add documents to build a style profile.";
  }

  return {
    sessionId,
    corpusId,
    status,
    styleProfile,
    ingestionJobIds: allJobIds,
    message,
  };
}

/**
 * Check whether all ingestion jobs for a Product Analyst session have completed.
 *
 * When all jobs are done and a style profile hasn't been extracted yet,
 * this function triggers style extraction automatically.
 *
 * Returns:
 *   ready:             true when all jobs are complete
 *   ingestionProgress: aggregated processed/total counts across all linked jobs
 */
export async function checkProductAnalystReadiness(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ ready: boolean; ingestionProgress: { total: number; processed: number } }> {
  // ── Load the corpus for this session ────────────────────────────────────────
  const { data: corpusData, error: corpusError } = await supabase
    .from("agent_corpus")
    .select("id, document_filter, style_profile, organization_id")
    .eq("agent_session_id", sessionId)
    .limit(1)
    .single();

  if (corpusError || !corpusData) {
    logger.warn("[product-analyst] checkReadiness — corpus not found", {
      sessionId,
      error: corpusError?.message ?? "no data",
    });
    return { ready: false, ingestionProgress: { total: 0, processed: 0 } };
  }

  const corpus = corpusData as {
    id: string;
    document_filter: unknown;
    style_profile: unknown;
    organization_id: string;
  };

  // ── Extract job IDs from document_filter ─────────────────────────────────────
  const rawFilter = corpus.document_filter;
  const jobIds: string[] =
    rawFilter &&
    typeof rawFilter === "object" &&
    Array.isArray((rawFilter as Record<string, unknown>)["ingestionJobIds"])
      ? ((rawFilter as Record<string, unknown>)["ingestionJobIds"] as string[])
      : [];

  // No jobs linked → ready immediately
  if (jobIds.length === 0) {
    return { ready: true, ingestionProgress: { total: 0, processed: 0 } };
  }

  // ── Query ingestion_jobs ──────────────────────────────────────────────────────
  const { data: jobs, error: jobsError } = await supabase
    .from("ingestion_jobs")
    .select("id, status, processed_documents, total_documents")
    .in("id", jobIds);

  if (jobsError) {
    logger.warn("[product-analyst] checkReadiness — failed to query ingestion_jobs", {
      sessionId,
      error: jobsError.message,
    });
    return { ready: false, ingestionProgress: { total: 0, processed: 0 } };
  }

  const jobRows = (jobs ?? []) as IngestionJobRow[];

  const totalDocuments = jobRows.reduce((sum, j) => sum + (j.total_documents ?? 0), 0);
  const processedDocuments = jobRows.reduce((sum, j) => sum + (j.processed_documents ?? 0), 0);

  const allDone =
    jobRows.length > 0 &&
    jobRows.every((j) => j.status === "completed" || j.status === "failed");

  // ── If all done and no style profile yet, extract now ────────────────────────
  if (allDone && !corpus.style_profile) {
    logger.warn("[product-analyst] All jobs complete — triggering style extraction", {
      sessionId,
      corpusId: corpus.id,
      jobCount: jobRows.length,
    });

    try {
      await extractStyleProfile(supabase, {
        organizationId: corpus.organization_id,
        corpusId: corpus.id,
        documentFilter: { ingestionJobIds: jobIds },
        sampleSize: 30,
      });
    } catch (err) {
      logger.warn("[product-analyst] Post-ingestion style extraction failed (non-fatal)", {
        sessionId,
        corpusId: corpus.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.warn("[product-analyst] Readiness check complete", {
    sessionId,
    ready: allDone,
    totalDocuments,
    processedDocuments,
    jobStatuses: jobRows.map((j) => j.status),
  });

  return {
    ready: allDone,
    ingestionProgress: {
      total: totalDocuments,
      processed: processedDocuments,
    },
  };
}
