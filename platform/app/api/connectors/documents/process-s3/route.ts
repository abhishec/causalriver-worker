/**
 * POST /api/connectors/documents/process-s3
 * ==========================================
 * Called by client AFTER uploading directly to S3 via pre-signed URL.
 * Downloads the file from S3, parses it, and ingests into document_chunks.
 *
 * Body: {
 *   s3Key: string,         // Key returned by presigned-upload endpoint
 *   documentTitle?: string,
 *   sourceUrl?: string,    // optional canonical URL for the document
 *   documentId?: string,   // optional external ID
 *   metadata?: object,
 *   pinned?: boolean
 * }
 *
 * Returns: { success: true, chunksCreated, documentTitle, pageCount, wordCount }
 */

import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { parseDocumentBuffer } from "@/lib/connectors/document-parser";
import { ingestDocument } from "@/lib/connectors/document-ingester";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — large file processing can take time

/**
 * Convert an AWS SDK v3 readable stream to a Buffer using the
 * transformToByteArray() API (SDK v3 pattern — avoids Node stream dependency).
 */
async function streamToBuffer(
  stream: { transformToByteArray(): Promise<Uint8Array> }
): Promise<Uint8Array> {
  return stream.transformToByteArray();
}

/**
 * Map a MIME type to the ingest pipeline's source type discriminator.
 */
function detectSourceType(mimeType: string): "pdf" | "markdown" | "text" {
  const lower = mimeType.toLowerCase();
  if (lower.includes("pdf")) return "pdf";
  if (lower.includes("markdown") || lower.includes("x-markdown")) return "markdown";
  return "text";
}

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getCurrentWorkspaceId();
  if (!orgId) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  // ── S3 config check ──────────────────────────────────────────────────
  if (!process.env.AWS_S3_BUCKET_NAME) {
    return NextResponse.json(
      { error: "S3 not configured — use direct upload endpoint" },
      { status: 501 }
    );
  }

  // ── Parse body ───────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    s3Key,
    documentTitle: rawDocumentTitle,
    sourceUrl,
    documentId,
    metadata,
    pinned,
  } = body as {
    s3Key?: string;
    documentTitle?: string;
    sourceUrl?: string;
    documentId?: string;
    metadata?: Record<string, unknown>;
    pinned?: boolean;
  };

  // ── Validate s3Key ───────────────────────────────────────────────────
  if (!s3Key || typeof s3Key !== "string") {
    return NextResponse.json({ error: "s3Key is required" }, { status: 400 });
  }

  // Security: s3Key must be scoped to this org to prevent cross-tenant file access.
  const expectedPrefix = `documents/${orgId}/`;
  if (!s3Key.startsWith(expectedPrefix)) {
    logger.warn("[process-s3] Cross-tenant s3Key access attempt blocked", {
      orgId,
      s3Key,
    });
    return NextResponse.json(
      { error: "Invalid s3Key: key is not scoped to your organization" },
      { status: 403 }
    );
  }

  // ── Download from S3 ─────────────────────────────────────────────────
  const s3 = new S3Client({
    region: process.env.AWS_REGION || "ap-southeast-1",
    ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });

  let fileBuffer: Buffer;
  let contentType: string;

  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: s3Key,
      })
    );

    if (!response.Body) {
      return NextResponse.json({ error: "Empty file body from S3" }, { status: 422 });
    }

    const bytes = await streamToBuffer(
      response.Body as { transformToByteArray(): Promise<Uint8Array> }
    );
    fileBuffer = Buffer.from(bytes);
    contentType = response.ContentType || "application/octet-stream";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[process-s3] Failed to download file from S3", { error: message, s3Key });
    return NextResponse.json(
      { error: `Failed to retrieve file from S3: ${message}` },
      { status: 500 }
    );
  }

  // ── Parse document ───────────────────────────────────────────────────
  const filename = path.basename(s3Key);
  let parsed;
  try {
    parsed = await parseDocumentBuffer(fileBuffer, contentType, filename);
  } catch (parseErr) {
    const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
    logger.error("[process-s3] File parse failed", { error: message, s3Key, contentType });
    return NextResponse.json({ error: `File parsing failed: ${message}` }, { status: 422 });
  }

  if (!parsed.text || parsed.text.trim().length === 0) {
    return NextResponse.json(
      {
        error:
          "No extractable text found (scanned image PDF?). OCR is required for image-only PDFs.",
      },
      { status: 422 }
    );
  }

  // ── Ingest ────────────────────────────────────────────────────────────
  const documentTitle = rawDocumentTitle || filename;
  const serviceClient = getAdminClient();

  let result;
  try {
    result = await ingestDocument(serviceClient, {
      organizationId: orgId,
      content: parsed.text,
      documentTitle,
      sourceType: detectSourceType(contentType),
      documentId,
      sourceUrl: sourceUrl || s3Key,
      metadata: {
        ...metadata,
        s3Key,
        pageCount: parsed.pageCount,
        wordCount: parsed.wordCount,
      },
      pinned,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[process-s3] Ingestion failed", { error: message, s3Key });
    return NextResponse.json({ error: "Ingestion failed" }, { status: 500 });
  }

  logger.warn("[process-s3] Document ingested from S3", {
    orgId,
    s3Key,
    documentTitle,
    chunksCreated: result.chunksCreated,
    pageCount: parsed.pageCount,
    wordCount: parsed.wordCount,
  });

  return NextResponse.json({
    success: true,
    chunksCreated: result.chunksCreated,
    documentTitle,
    pageCount: parsed.pageCount ?? null,
    wordCount: parsed.wordCount,
  });
}
