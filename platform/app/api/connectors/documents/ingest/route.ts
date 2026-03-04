/**
 * POST /api/connectors/documents/ingest
 * ======================================
 * Accepts raw text content OR a file upload and ingests it into document_chunks
 * for BrainContextMesh semantic + full-text retrieval.
 *
 * Accepts two content formats:
 *
 * 1. JSON body (pre-extracted text):
 *      content      (required) — raw text to chunk and store
 *      sourceType   — 'pdf' | 'confluence' | 'github' | 'markdown' | 'text' (default: 'text')
 *      documentTitle — human-readable title
 *      sourceUrl    — original URL or S3 key
 *      documentId   — external ID (e.g. Confluence page ID, GitHub blob SHA)
 *      metadata     — arbitrary JSONB (page number, section headings, etc.)
 *      pinned       — if true, chunk never expires (default: false)
 *
 * 2. multipart/form-data (file upload):
 *      file         (required) — PDF (.pdf) or Word (.docx) file
 *      sourceType   — same as above (auto-detected from MIME if omitted)
 *      documentTitle — human-readable title (defaults to filename)
 *      sourceUrl    — original URL or S3 key
 *      documentId   — external ID
 *      pinned       — 'true' | 'false'
 *
 *   Supported file types for upload: PDF, DOCX, plain text, Markdown.
 *   Max upload size: 1 GB (use S3 upload path for Lambda deployments > 6 MB).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { ingestDocument } from "@/lib/connectors/document-ingester";
import { parseDocumentBuffer } from "@/lib/connectors/document-parser";
import { logger } from "@/lib/logger";

const MAX_UPLOAD_SIZE = 1024 * 1024 * 1024; // 1 GB
const MAX_PDF_SIZE = 50 * 1024 * 1024;      // 50 MB — pdf-parse memory constraint

const UPLOAD_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
]);

export const dynamic = "force-dynamic";
// Allow up to 1 GB uploads — Next.js default body limit is 4 MB.
// For Amplify/Lambda deployments, files > 6 MB must use the S3 upload path.
export const maxDuration = 60; // seconds (Vercel/Amplify max for large file processing)

// Supported source types for the ingest pipeline
const validSourceTypes = ["pdf", "confluence", "github", "markdown", "text", "local-files"] as const;
type ValidSourceType = typeof validSourceTypes[number];

function resolveSourceType(raw: string | undefined): ValidSourceType {
  if (raw && validSourceTypes.includes(raw as ValidSourceType)) {
    return raw as ValidSourceType;
  }
  return "text";
}

export async function POST(req: NextRequest) {
  // ── Auth: isolated try-catch so Lambda env-var errors return 401 not 500 ──
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData, error: authError } = await supabase.auth.getUser();
    if (authError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  let content: string;
  let sourceType: ValidSourceType;
  let documentTitle: string | undefined;
  let sourceUrl: string | undefined;
  let documentId: string | undefined;
  let metadata: Record<string, unknown> | undefined;
  let pinned: boolean | undefined;
  // PDF parse stats — populated for file uploads, used in response
  let parsedPageCount: number | undefined;
  let parsedWordCount: number | undefined;

  // ── Path A: multipart/form-data — file upload ─────────────────────────
  if (isMultipart) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Failed to parse form data" }, { status: 400 });
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Send a PDF or DOCX via multipart/form-data with field name 'file'." },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum upload size is ${MAX_UPLOAD_SIZE / 1024 / 1024}MB.` },
        { status: 413 }
      );
    }

    const mimeType = file.type || "";
    const filename = file.name || "upload";

    // PDF-specific size limit: pdf-parse loads the entire document into memory.
    // Limiting PDFs to 50 MB prevents Lambda OOM on large scanned files.
    const isPdf = mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
    if (isPdf && file.size > MAX_PDF_SIZE) {
      return NextResponse.json(
        { error: `PDF too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum PDF size is ${MAX_PDF_SIZE / 1024 / 1024} MB. For larger documents, extract text first and use the JSON body format.` },
        { status: 413 }
      );
    }

    // Accept PDF, DOCX, plain text, and markdown by MIME or extension
    const isAllowedMime = UPLOAD_ALLOWED_MIME_TYPES.has(mimeType);
    const isAllowedExt =
      filename.toLowerCase().endsWith(".pdf") ||
      filename.toLowerCase().endsWith(".docx") ||
      filename.toLowerCase().endsWith(".txt") ||
      filename.toLowerCase().endsWith(".md");

    if (!isAllowedMime && !isAllowedExt) {
      return NextResponse.json(
        { error: `Unsupported file type: "${mimeType || filename}". Allowed: PDF, DOCX, TXT, MD.` },
        { status: 400 }
      );
    }

    // Parse the file bytes into plain text
    const buffer = Buffer.from(await file.arrayBuffer());
    let parsed;
    try {
      parsed = await parseDocumentBuffer(buffer, mimeType, filename);
    } catch (parseErr) {
      const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
      logger.error("[/api/connectors/documents/ingest] file parse failed", { error: message, filename });
      return NextResponse.json({ error: `File parsing failed: ${message}` }, { status: 422 });
    }

    if (!parsed.text || parsed.text.trim().length === 0) {
      return NextResponse.json(
        { error: "No text could be extracted from the file. If this is a scanned PDF, OCR is required." },
        { status: 422 }
      );
    }

    content = parsed.text;
    // Capture parse stats for the response body
    parsedPageCount = parsed.pageCount;
    parsedWordCount = parsed.wordCount;

    // Auto-detect source type from MIME/extension if not provided
    const rawSourceType = formData.get("sourceType") as string | null;
    if (rawSourceType) {
      sourceType = resolveSourceType(rawSourceType);
    } else if (mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
      sourceType = "pdf";
    } else if (filename.toLowerCase().endsWith(".md")) {
      sourceType = "markdown";
    } else {
      sourceType = "text";
    }

    documentTitle = (formData.get("documentTitle") as string | null) ?? filename;
    sourceUrl = (formData.get("sourceUrl") as string | null) ?? undefined;
    documentId = (formData.get("documentId") as string | null) ?? undefined;
    pinned = formData.get("pinned") === "true";

    // Enrich metadata with parse results
    metadata = {
      ...(formData.get("metadata") ? JSON.parse(formData.get("metadata") as string) : {}),
      originalFilename: filename,
      mimeType,
      fileSize: file.size,
      wordCount: parsed.wordCount,
      ...(parsed.pageCount !== undefined ? { pageCount: parsed.pageCount } : {}),
    };

    logger.warn("[/api/connectors/documents/ingest] file upload parsed", {
      filename,
      mimeType,
      fileSize: file.size,
      wordCount: parsed.wordCount,
      pageCount: parsed.pageCount,
      textLength: content.length,
    });
  } else {
    // ── Path B: application/json — pre-extracted text ─────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const {
      content: rawContent,
      sourceType: rawSourceType = "text",
      documentTitle: rawTitle,
      sourceUrl: rawSourceUrl,
      documentId: rawDocumentId,
      metadata: rawMetadata,
      pinned: rawPinned,
    } = body as {
      content?: string;
      sourceType?: string;
      documentTitle?: string;
      sourceUrl?: string;
      documentId?: string;
      metadata?: Record<string, unknown>;
      pinned?: boolean;
    };

    if (!rawContent || typeof rawContent !== "string") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }
    if (rawContent.length > 10_000_000) {
      return NextResponse.json({ error: "Document too large (max 10MB text)" }, { status: 413 });
    }

    content = rawContent;
    sourceType = resolveSourceType(rawSourceType as string);
    documentTitle = rawTitle;
    sourceUrl = rawSourceUrl;
    documentId = rawDocumentId;
    metadata = rawMetadata;
    pinned = rawPinned;
  }

  // ── Ingest ────────────────────────────────────────────────────────────
  const service = getAdminClient();

  try {
    const result = await ingestDocument(service, {
      organizationId: workspaceId,
      sourceUrl,
      sourceType,
      documentTitle,
      documentId,
      content,
      metadata,
      pinned,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      ingestedChunks: result.chunksCreated,
      // PDF-specific stats (undefined for JSON path — omitted from response)
      ...(parsedPageCount !== undefined ? { pages: parsedPageCount } : {}),
      ...(parsedWordCount !== undefined ? { wordCount: parsedWordCount } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[/api/connectors/documents/ingest] failed", { error: message });
    return NextResponse.json({ error: "Ingestion failed" }, { status: 500 });
  }
}
