/**
 * POST /api/connectors/documents/presigned-upload
 * ================================================
 * Returns a pre-signed S3 PUT URL so the client can upload large files
 * (PDFs, DOCX, etc.) directly to S3 — bypassing Lambda's 6MB payload limit.
 *
 * Flow:
 *   1. Client POSTs { filename, mimeType, fileSize, documentTitle?, metadata? }
 *   2. Server validates auth + org, generates pre-signed PUT URL (15 min TTL)
 *   3. Client PUTs file directly to S3 using the URL (no Lambda involvement)
 *   4. Client POSTs to /api/connectors/documents/process-s3 to trigger ingestion
 *
 * Body: { filename: string, mimeType: string, fileSize: number, documentTitle?: string, pinned?: boolean }
 * Returns: { uploadUrl: string, s3Key: string, expiresAt: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — large file processing can take time

const PRESIGN_TTL_SECONDS = 900; // 15 minutes
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB (S3 single PUT limit)

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
]);

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user;
  try {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    user = data.user;
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
    filename: rawFilename,
    mimeType,
    fileSize,
    documentTitle: rawDocumentTitle,
    pinned,
  } = body as {
    filename?: string;
    mimeType?: string;
    fileSize?: number;
    documentTitle?: string;
    pinned?: boolean;
  };

  // ── Validate inputs ──────────────────────────────────────────────────
  if (!rawFilename || typeof rawFilename !== "string") {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  if (!mimeType || typeof mimeType !== "string") {
    return NextResponse.json({ error: "mimeType is required" }, { status: 400 });
  }

  if (!fileSize || typeof fileSize !== "number" || fileSize <= 0) {
    return NextResponse.json({ error: "fileSize must be a positive number" }, { status: 400 });
  }

  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024 / 1024}GB.` },
      { status: 413 }
    );
  }

  // Validate MIME type (also allow by extension fallback)
  const lowerName = rawFilename.toLowerCase();
  const isAllowedMime = ALLOWED_MIME_TYPES.has(mimeType.toLowerCase());
  const isAllowedExt =
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md");

  if (!isAllowedMime && !isAllowedExt) {
    return NextResponse.json(
      {
        error: `Unsupported file type: "${mimeType}". Allowed: PDF, DOCX, TXT, MD.`,
      },
      { status: 400 }
    );
  }

  // ── Build S3 key ─────────────────────────────────────────────────────
  const sanitizedFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const s3Key = `documents/${orgId}/${Date.now()}-${sanitizedFilename}`;
  const documentTitle = rawDocumentTitle || rawFilename;

  // ── Generate pre-signed URL ──────────────────────────────────────────
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

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: s3Key,
    ContentType: mimeType,
    ContentLength: fileSize,
    Metadata: {
      organization_id: orgId,
      uploaded_by: user.id,
      original_filename: rawFilename,
      document_title: documentTitle,
      pinned: String(pinned ?? false),
    },
  });

  let uploadUrl: string;
  try {
    uploadUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_TTL_SECONDS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[presigned-upload] Failed to generate pre-signed URL", { error: message });
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000).toISOString();

  logger.warn("[presigned-upload] Pre-signed URL generated", {
    orgId,
    userId: user.id,
    filename: rawFilename,
    mimeType,
    fileSize,
    s3Key,
    expiresAt,
  });

  return NextResponse.json({ uploadUrl, s3Key, expiresAt });
}
