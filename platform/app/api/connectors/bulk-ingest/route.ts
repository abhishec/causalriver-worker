/**
 * POST /api/connectors/bulk-ingest
 *
 * Creates an ingestion_jobs row to trigger a bulk document ingestion.
 * The actual ingestion runs asynchronously via /api/cron/process-ingestion.
 *
 * Supported connector types:
 *   - google_drive: source_config must include { folderId, folderName? }
 *   - web_crawler:  source_config must include { seedUrls[], maxDepth?, maxPages?, allowedDomains? }
 *   - confluence:   source_config must include { spaceKeys?, pageLimit? }
 *
 * Auth: Supabase session + org membership check.
 * The job is scoped to the caller's organization_id.
 *
 * Response:
 *   201 { jobId: string, status: "pending", connectorType: string }
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { createIngestionJob } from "@/lib/connectors/batch-ingestion-orchestrator";
import { logger } from "@/lib/logger";

const SUPPORTED_CONNECTOR_TYPES = new Set(["google_drive", "web_crawler", "confluence"]);

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user = null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    user = authData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── Workspace resolution ────────────────────────────────────────────────
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // ── Request body ────────────────────────────────────────────────────────
    let body: {
      connectorType?: string;
      sourceConfig?: Record<string, unknown>;
      aiWorkerId?: string;
    };

    try {
      body = await request.json() as typeof body;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const { connectorType, sourceConfig, aiWorkerId } = body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!connectorType || typeof connectorType !== "string") {
      return NextResponse.json(
        { error: "connectorType is required" },
        { status: 400 },
      );
    }

    if (!SUPPORTED_CONNECTOR_TYPES.has(connectorType)) {
      return NextResponse.json(
        {
          error: `Unsupported connectorType "${connectorType}". Supported: ${[...SUPPORTED_CONNECTOR_TYPES].join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (!sourceConfig || typeof sourceConfig !== "object") {
      return NextResponse.json(
        { error: "sourceConfig is required and must be an object" },
        { status: 400 },
      );
    }

    // Per-type validation
    if (connectorType === "google_drive") {
      if (!sourceConfig.folderId || typeof sourceConfig.folderId !== "string") {
        return NextResponse.json(
          { error: "sourceConfig.folderId is required for google_drive ingestion" },
          { status: 400 },
        );
      }
    }

    if (connectorType === "web_crawler") {
      if (
        !sourceConfig.seedUrls ||
        !Array.isArray(sourceConfig.seedUrls) ||
        sourceConfig.seedUrls.length === 0
      ) {
        return NextResponse.json(
          { error: "sourceConfig.seedUrls (non-empty array) is required for web_crawler ingestion" },
          { status: 400 },
        );
      }
      // Validate each seed URL
      for (const url of sourceConfig.seedUrls as unknown[]) {
        if (typeof url !== "string") {
          return NextResponse.json(
            { error: "sourceConfig.seedUrls must be an array of strings" },
            { status: 400 },
          );
        }
        try {
          new URL(url);
        } catch {
          return NextResponse.json(
            { error: `Invalid seed URL: "${url}"` },
            { status: 400 },
          );
        }
      }
    }

    // Optional: validate aiWorkerId belongs to the workspace
    if (aiWorkerId) {
      const { data: workerRow } = await supabase
        .from("ai_workers")
        .select("id")
        .eq("id", aiWorkerId)
        .eq("organization_id", workspaceId)
        .maybeSingle();

      if (!workerRow) {
        return NextResponse.json(
          { error: "aiWorkerId not found in this workspace" },
          { status: 400 },
        );
      }
    }

    // ── Create the ingestion job ────────────────────────────────────────────
    const service = await createServiceClient();

    const jobId = await createIngestionJob(service, {
      organizationId: workspaceId,
      aiWorkerId: aiWorkerId ?? undefined,
      connectorType,
      sourceConfig,
      createdBy: user.id,
    });

    if (!jobId) {
      logger.warn("[bulk-ingest] Failed to create ingestion job", {
        connectorType,
        workspaceId,
        userId: user.id,
      });
      return NextResponse.json(
        { error: "Failed to create ingestion job" },
        { status: 500 },
      );
    }

    logger.warn("[bulk-ingest] Ingestion job created", {
      jobId,
      connectorType,
      workspaceId,
      aiWorkerId: aiWorkerId ?? null,
    });

    return NextResponse.json(
      {
        jobId,
        status: "pending",
        connectorType,
        message: `Ingestion job queued. It will be processed on the next cron tick (~5 min).`,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    logger.error("[bulk-ingest] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
