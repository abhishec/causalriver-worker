/**
 * GET /api/cron/process-ingestion
 *
 * Processes pending ingestion_jobs rows, draining them batch-by-batch.
 *
 * For each pending/running job (up to MAX_JOBS_PER_RUN = 3):
 *   - Reads connector_type and source_config from the job row
 *   - Builds a fetchDocuments() callback appropriate for that connector
 *   - Calls processBatchIngestion(supabase, jobId, fetchDocuments)
 *     which processes up to BATCH_SIZE=5 documents per invocation
 *
 * Connector types handled:
 *   google_drive  — lists Drive folder, downloads each file
 *   web_crawler   — crawls configured seed URLs (BFS)
 *   confluence    — fetches Confluence space pages via REST API
 *
 * Auth: Bearer CRON_SECRET header.
 *
 * Schedule: every 5 minutes via AWS EventBridge or Amplify Hosting cron.
 *   0/5 * * * ? *  (EventBridge cron expression)
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s Lambda limit for ingestion (heavier than normal crons)

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getPendingIngestionJobs,
  processBatchIngestion,
} from "@/lib/connectors/batch-ingestion-orchestrator";
import type { IngestionJob, DocumentToIngest } from "@/lib/connectors/batch-ingestion-orchestrator";
import { getConnectorWithCredentials } from "@/lib/connectors/get-credentials";
import {
  listAllFilesInFolder,
  getGoogleDriveFileContent,
} from "@/lib/connectors/google-drive-client";
import { crawlWebsites } from "@/lib/connectors/web-crawler";
import { parseDocumentBuffer } from "@/lib/connectors/document-parser";
import { logger } from "@/lib/logger";

// Static capture for Lambda SSR
const CRON_SECRET = process.env.CRON_SECRET;

const MAX_JOBS_PER_RUN = 3;
/** Lambda safety timeout — stop processing 5s before the 60s maxDuration. */
const LAMBDA_TIMEOUT_MS = 55_000;

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();

  try {
    const supabase = await createServiceClient();

    // ── Fetch pending jobs ────────────────────────────────────────────────
    const jobs = await getPendingIngestionJobs(supabase, MAX_JOBS_PER_RUN);

    if (jobs.length === 0) {
      return NextResponse.json({ ok: true, message: "No pending ingestion jobs", processed: 0 });
    }

    logger.warn("[cron/process-ingestion] Processing jobs", { count: jobs.length });

    const results: Array<{
      jobId: string;
      connectorType: string;
      processed: number;
      failed: number;
      chunksCreated: number;
      completed: boolean;
      error?: string;
    }> = [];

    for (const job of jobs) {
      // Lambda timeout guard: stop before we hit the wall
      if (Date.now() - startMs > LAMBDA_TIMEOUT_MS) {
        logger.warn("[cron/process-ingestion] Lambda timeout guard — stopping job loop early", {
          processedJobs: results.length,
          remainingJobs: jobs.length - results.length,
        });
        break;
      }

      try {
        const result = await processJobBatch(supabase, job, startMs);
        results.push({ jobId: job.id, connectorType: job.connector_type, ...result });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn("[cron/process-ingestion] Job batch failed", {
          jobId: job.id,
          connectorType: job.connector_type,
          error: errorMsg,
        });
        results.push({
          jobId: job.id,
          connectorType: job.connector_type,
          processed: 0,
          failed: 0,
          chunksCreated: 0,
          completed: false,
          error: errorMsg,
        });

        // Mark the job as failed so it doesn't spin forever
        await supabase
          .from("ingestion_jobs")
          .update({
            status: "failed",
            error_log: [
              {
                documentTitle: "__job_error__",
                error: errorMsg,
                timestamp: new Date().toISOString(),
              },
            ],
          })
          .eq("id", job.id);
      }
    }

    const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
    const totalChunks = results.reduce((sum, r) => sum + r.chunksCreated, 0);
    const durationMs = Date.now() - startMs;

    logger.warn("[cron/process-ingestion] Run complete", {
      jobs: results.length,
      totalProcessed,
      totalChunks,
      durationMs,
    });

    return NextResponse.json({
      ok: true,
      jobs: results,
      totalProcessed,
      totalChunks,
      durationMs,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[cron/process-ingestion] Fatal error", { error: errorMsg });
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

// ── Per-job batch processor ────────────────────────────────────────────────

async function processJobBatch(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  job: IngestionJob,
  globalStartMs: number,
): Promise<{ processed: number; failed: number; chunksCreated: number; completed: boolean }> {
  const { connector_type, organization_id, source_config } = job;

  logger.warn("[cron/process-ingestion] Starting job batch", {
    jobId: job.id,
    connectorType: connector_type,
    processedSoFar: job.processed_documents,
  });

  switch (connector_type) {
    case "google_drive":
      return processGoogleDriveBatch(supabase, job, source_config, globalStartMs);

    case "web_crawler":
      return processWebCrawlerBatch(supabase, job, source_config, globalStartMs);

    case "confluence":
      return processConfluenceBatch(supabase, job, source_config, organization_id);

    default:
      throw new Error(`Unknown connector_type: ${connector_type}`);
  }
}

// ── Google Drive batch ─────────────────────────────────────────────────────

async function processGoogleDriveBatch(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  job: IngestionJob,
  sourceConfig: Record<string, unknown>,
  globalStartMs: number,
): Promise<{ processed: number; failed: number; chunksCreated: number; completed: boolean }> {
  const folderId = sourceConfig.folderId as string;
  if (!folderId) {
    throw new Error("google_drive sourceConfig.folderId is missing");
  }

  // Load connector credentials
  const connector = await getConnectorWithCredentials(supabase, job.organization_id, "google_drive");
  if (!connector?.credentials) {
    throw new Error("Google Drive connector credentials not found. Please reconnect the connector.");
  }

  const accessToken = (connector.credentials as Record<string, unknown>).access_token as string;
  if (!accessToken) {
    throw new Error("Google Drive access_token missing. Please reconnect the connector.");
  }

  // Cache the file list in the job's checkpoint to avoid re-listing on every tick
  let fileList: Array<{ id: string; name: string; mimeType: string }> = [];

  const checkpoint = job.checkpoint as Record<string, unknown> | null;
  const cachedFileList = checkpoint?.fileList as typeof fileList | undefined;

  if (cachedFileList && cachedFileList.length > 0) {
    fileList = cachedFileList;
    logger.warn("[cron/process-ingestion] Using cached file list from checkpoint", {
      jobId: job.id,
      fileCount: fileList.length,
    });
  } else {
    // First tick: list all files in the folder
    logger.warn("[cron/process-ingestion] Listing Google Drive folder", { folderId });
    const driveFiles = await listAllFilesInFolder(accessToken, folderId, { maxFiles: 500 });
    fileList = driveFiles.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType }));

    // Persist file list in checkpoint so future ticks use it directly
    await supabase
      .from("ingestion_jobs")
      .update({
        total_documents: fileList.length,
        checkpoint: { fileList, lastOffset: 0 },
      })
      .eq("id", job.id);

    logger.warn("[cron/process-ingestion] Drive folder listed", {
      jobId: job.id,
      totalFiles: fileList.length,
    });
  }

  // fetchDocuments callback: returns a slice of files with downloaded content
  const fetchDocuments = async (
    _batchJob: IngestionJob,
    offset: number,
    limit: number,
  ): Promise<{ documents: DocumentToIngest[]; totalAvailable: number }> => {
    const slice = fileList.slice(offset, offset + limit);
    const documents: DocumentToIngest[] = [];

    for (const file of slice) {
      // Stop if we're near the Lambda timeout
      if (Date.now() - globalStartMs > 50_000) break;

      try {
        const fileContent = await getGoogleDriveFileContent(
          accessToken,
          file.id,
          file.mimeType,
          file.name,
        );

        // For binary files (PDF, DOCX), decode and parse text content.
        // Uses pdf-parse (for PDFs) and mammoth (for DOCX) via document-parser.ts.
        if (fileContent.needsBinaryParsing) {
          let parsedContent = "";
          let parsedSourceType: "pdf" | "text" = "text";
          let parseMetadata: Record<string, unknown> = {};

          try {
            const buffer = Buffer.from(fileContent.content, "base64");
            const parsed = await parseDocumentBuffer(buffer, file.mimeType, file.name);
            parsedContent = parsed.text;
            parsedSourceType = file.mimeType === "application/pdf" || file.name.endsWith(".pdf") ? "pdf" : "text";
            parseMetadata = {
              pageCount: parsed.pageCount,
              wordCount: parsed.wordCount,
              parsedFromBinary: true,
            };
            logger.warn("[cron/process-ingestion] Binary file parsed", {
              fileName: file.name,
              mimeType: file.mimeType,
              wordCount: parsed.wordCount,
              pageCount: parsed.pageCount,
            });
          } catch (parseErr) {
            // Parsing failed — store metadata placeholder so we don't lose the file entirely
            parsedContent = `[Binary file — ${file.mimeType}. Size: ${fileContent.sizeBytes} bytes. ` +
              `Parsing failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}. ` +
              `Source: Google Drive file ID ${file.id}.]`;
            parseMetadata = { parseFailed: true, parseError: parseErr instanceof Error ? parseErr.message : String(parseErr) };
            logger.warn("[cron/process-ingestion] Binary file parse failed", {
              fileName: file.name,
              error: parseErr instanceof Error ? parseErr.message : String(parseErr),
            });
          }

          documents.push({
            title: file.name,
            content: parsedContent,
            sourceUrl: `https://drive.google.com/file/d/${file.id}/view`,
            sourceType: parsedSourceType,
            metadata: {
              driveFileId: file.id,
              driveMimeType: file.mimeType,
              sizeBytes: fileContent.sizeBytes,
              ...parseMetadata,
            },
          });
        } else {
          documents.push({
            title: file.name,
            content: fileContent.content,
            sourceUrl: `https://drive.google.com/file/d/${file.id}/view`,
            sourceType: fileContent.mimeType.includes("spreadsheet") ? "text" : "text",
            metadata: {
              driveFileId: file.id,
              driveMimeType: file.mimeType,
              sizeBytes: fileContent.sizeBytes,
            },
          });
        }
      } catch (err: unknown) {
        logger.warn("[cron/process-ingestion] Drive file download failed (continuing)", {
          fileId: file.id,
          fileName: file.name,
          error: err instanceof Error ? err.message : String(err),
        });
        // Return a placeholder document that records the failure
        documents.push({
          title: `[Failed] ${file.name}`,
          content: `Failed to download file "${file.name}" (ID: ${file.id}). ` +
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          sourceUrl: `https://drive.google.com/file/d/${file.id}/view`,
          sourceType: "text",
          metadata: { driveFileId: file.id, downloadFailed: true },
        });
      }
    }

    return { documents, totalAvailable: fileList.length };
  };

  return processBatchIngestion(supabase, job.id, fetchDocuments);
}

// ── Web Crawler batch ──────────────────────────────────────────────────────

async function processWebCrawlerBatch(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  job: IngestionJob,
  sourceConfig: Record<string, unknown>,
  globalStartMs: number,
): Promise<{ processed: number; failed: number; chunksCreated: number; completed: boolean }> {
  const seedUrls = sourceConfig.seedUrls as string[];
  if (!seedUrls || seedUrls.length === 0) {
    throw new Error("web_crawler sourceConfig.seedUrls is missing or empty");
  }

  const maxDepth = (sourceConfig.maxDepth as number | undefined) ?? 2;
  const maxPages = (sourceConfig.maxPages as number | undefined) ?? 100;
  const allowedDomains = (sourceConfig.allowedDomains as string[] | undefined) ?? [];
  const excludePatterns = (sourceConfig.excludePatterns as string[] | undefined) ?? [];

  // For the web crawler, we buffer pages up-front (within the Lambda budget)
  // then store them in the checkpoint for paginated processing across ticks.
  const checkpoint = job.checkpoint as Record<string, unknown> | null;
  let crawledPages: Array<{ url: string; title: string; textContent: string }> = [];

  const cachedPages = checkpoint?.crawledPages as typeof crawledPages | undefined;

  if (cachedPages && cachedPages.length > 0) {
    crawledPages = cachedPages;
    logger.warn("[cron/process-ingestion] Using cached crawl results from checkpoint", {
      jobId: job.id,
      pageCount: crawledPages.length,
    });
  } else {
    // First tick: run the crawl and cache results
    logger.warn("[cron/process-ingestion] Starting web crawl", { seedUrls, maxDepth, maxPages });

    const crawlConfig = {
      seedUrls,
      maxDepth,
      maxPages,
      allowedDomains,
      excludePatterns,
    };

    // Crawl with a time budget — stop if we're near the Lambda limit
    for await (const page of crawlWebsites(crawlConfig)) {
      if (Date.now() - globalStartMs > 45_000) {
        logger.warn("[cron/process-ingestion] Lambda timeout approaching during crawl — stopping", {
          pagesCollected: crawledPages.length,
        });
        break;
      }
      crawledPages.push({ url: page.url, title: page.title, textContent: page.textContent });
    }

    // Persist crawl results in checkpoint
    await supabase
      .from("ingestion_jobs")
      .update({
        total_documents: crawledPages.length,
        checkpoint: { crawledPages, lastOffset: 0 },
      })
      .eq("id", job.id);

    logger.warn("[cron/process-ingestion] Crawl complete, cached results", {
      jobId: job.id,
      totalPages: crawledPages.length,
    });
  }

  // fetchDocuments: slice the cached crawl results
  const fetchDocuments = async (
    _batchJob: IngestionJob,
    offset: number,
    limit: number,
  ): Promise<{ documents: DocumentToIngest[]; totalAvailable: number }> => {
    const slice = crawledPages.slice(offset, offset + limit);
    const documents: DocumentToIngest[] = slice.map((page) => ({
      title: page.title,
      content: page.textContent,
      sourceUrl: page.url,
      sourceType: "text" as const,
      metadata: {
        crawledUrl: page.url,
        crawledAt: new Date().toISOString(),
        seedUrls,
      },
    }));

    return { documents, totalAvailable: crawledPages.length };
  };

  return processBatchIngestion(supabase, job.id, fetchDocuments);
}

// ── Confluence batch ───────────────────────────────────────────────────────

async function processConfluenceBatch(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  job: IngestionJob,
  sourceConfig: Record<string, unknown>,
  organizationId: string,
): Promise<{ processed: number; failed: number; chunksCreated: number; completed: boolean }> {
  const spaceKeys = (sourceConfig.spaceKeys as string[] | undefined) ?? [];
  const pageLimit = (sourceConfig.pageLimit as number | undefined) ?? 100;
  const effectivePageLimit = Math.min(pageLimit, 200);

  // Load Confluence connector
  const connector = await getConnectorWithCredentials(supabase, organizationId, "confluence");
  if (!connector?.credentials) {
    throw new Error("Confluence connector credentials not found. Please reconnect Confluence.");
  }

  const credentials = connector.credentials as { access_token?: string };
  const config = connector.config as Record<string, unknown>;
  const accessToken = credentials.access_token;
  const cloudId = config.cloud_id as string | undefined;

  if (!accessToken || !cloudId) {
    throw new Error("Confluence credentials incomplete — missing access_token or cloud_id.");
  }

  // Cache the page list in the checkpoint across ticks
  const checkpoint = job.checkpoint as Record<string, unknown> | null;
  let pageList: Array<{ id: string; title: string; spaceKey: string; webUrl: string }> = [];

  const cachedPageList = checkpoint?.pageList as typeof pageList | undefined;

  if (cachedPageList && cachedPageList.length > 0) {
    pageList = cachedPageList;
    logger.warn("[cron/process-ingestion] Using cached Confluence page list", {
      jobId: job.id,
      pageCount: pageList.length,
    });
  } else {
    // Fetch all Confluence page IDs first
    const spacesData = await confluenceFetch(accessToken, cloudId, "/wiki/rest/api/space?limit=50&type=global");
    const allSpaces = ((spacesData as { results?: unknown[] }).results ?? []) as Array<{
      key: string;
      name: string;
    }>;

    const targetSpaces = spaceKeys.length > 0
      ? allSpaces.filter((s) => spaceKeys.includes(s.key))
      : allSpaces;

    const siteUrl = config?.site_url as string | undefined;
    let totalPagesCap = effectivePageLimit;

    for (const space of targetSpaces) {
      if (totalPagesCap <= 0) break;
      let startAt = 0;
      let hasMore = true;
      const pageSize = Math.min(25, totalPagesCap);

      while (hasMore && totalPagesCap > 0) {
        const pagesData = await confluenceFetch(
          accessToken,
          cloudId,
          `/wiki/rest/api/space/${space.key}/content/page?limit=${pageSize}&start=${startAt}&expand=version`,
        );
        const pagesTyped = pagesData as {
          results?: Array<{ id: string; title: string; _links: { webui: string } }>;
          size?: number;
        };
        const batch = pagesTyped.results ?? [];

        for (const page of batch) {
          const pageUrl = siteUrl
            ? `${siteUrl}/wiki${page._links?.webui ?? ""}`
            : `https://confluence.atlassian.com/wiki${page._links?.webui ?? ""}`;
          pageList.push({ id: page.id, title: page.title, spaceKey: space.key, webUrl: pageUrl });
        }

        startAt += batch.length;
        totalPagesCap -= batch.length;
        hasMore = batch.length === pageSize && (pagesTyped.size ?? 0) > startAt;
      }
    }

    // Persist page list in checkpoint
    await supabase
      .from("ingestion_jobs")
      .update({
        total_documents: pageList.length,
        checkpoint: { pageList, lastOffset: 0 },
      })
      .eq("id", job.id);

    logger.warn("[cron/process-ingestion] Confluence page list cached", {
      jobId: job.id,
      totalPages: pageList.length,
    });
  }

  // fetchDocuments: fetch page body for each slice
  const fetchDocuments = async (
    _batchJob: IngestionJob,
    offset: number,
    limit: number,
  ): Promise<{ documents: DocumentToIngest[]; totalAvailable: number }> => {
    const slice = pageList.slice(offset, offset + limit);
    const documents: DocumentToIngest[] = [];

    for (const page of slice) {
      try {
        const pageData = await confluenceFetch(
          accessToken,
          cloudId!,
          `/wiki/rest/api/content/${page.id}?expand=body.storage`,
        );
        const pageTyped = pageData as { body?: { storage?: { value?: string } } };
        const storageBody = pageTyped.body?.storage?.value ?? "";
        const textContent = stripConfluenceHtml(storageBody);

        documents.push({
          title: page.title,
          content: textContent || `[Empty page: ${page.title}]`,
          sourceUrl: page.webUrl,
          sourceType: "confluence",
          metadata: { spaceKey: page.spaceKey, pageId: page.id },
        });
      } catch (err: unknown) {
        logger.warn("[cron/process-ingestion] Confluence page fetch failed", {
          pageId: page.id,
          error: err instanceof Error ? err.message : String(err),
        });
        documents.push({
          title: `[Failed] ${page.title}`,
          content: `Failed to fetch page "${page.title}" (ID: ${page.id}).`,
          sourceType: "confluence",
          metadata: { pageId: page.id, fetchFailed: true },
        });
      }
    }

    return { documents, totalAvailable: pageList.length };
  };

  return processBatchIngestion(supabase, job.id, fetchDocuments);
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function confluenceFetch(
  accessToken: string,
  cloudId: string,
  endpoint: string,
): Promise<Record<string, unknown>> {
  const url = `https://api.atlassian.com/ex/confluence/${cloudId}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Confluence API error: ${response.status} ${response.statusText} — ${url}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

function stripConfluenceHtml(html: string): string {
  if (!html) return "";
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi, "");
  text = text.replace(/<\/(p|div|li|tr|h[1-6]|br)>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  return text.replace(/\s{2,}/g, " ").trim();
}
