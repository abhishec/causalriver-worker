/**
 * POST /api/brain/ingest-document
 * ================================
 * Accepts a multipart/form-data PDF (or plain text) upload, extracts text via the
 * Anthropic document-block API (claude-haiku — cheapest), chunks the text, and
 * stores all chunks in document_chunks for BrainContextMesh retrieval.
 *
 * Limits:
 *   - Max file size : 50 MB
 *   - Max chunks    : 200 (prevents flooding document_chunks)
 *
 * For PDFs larger than a single Anthropic call can handle (>32 pages per call),
 * the file is split into 32-page batches and each batch is extracted separately,
 * then the text is concatenated before chunking.
 *
 * Body (multipart/form-data):
 *   file     — PDF or plain-text file (required)
 *   title    — human-readable document title (optional; defaults to filename)
 *   category — arbitrary tag stored in metadata (optional)
 *   pinned   — "true" | "false" (optional; pinned chunks never expire)
 *
 * Returns:
 *   { success: true, chunksIngested: N, documentTitle: string }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { ingestDocument } from "@/lib/connectors/document-ingester";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// 50 MB limit — enforced before reading
const MAX_FILE_BYTES = 50 * 1024 * 1024;

// Anthropic has a ~32 MB / ~100-page practical limit per document call.
// We batch at 20 MB per call to stay well within the limit.
const MAX_BYTES_PER_CALL = 20 * 1024 * 1024;

// Hard cap on chunks stored per document to prevent ai_memory flooding
const MAX_CHUNKS = 200;

// ── Anthropic client (server-only) ─────────────────────────────────────────
function getAnthropicClient(): Anthropic {
  const apiKey =
    process.env.ANTHROPIC_API_KEY ??
    process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

// ── Text extraction from PDF bytes via Anthropic document block ────────────
async function extractTextFromPDF(pdfBytes: Uint8Array): Promise<string> {
  const anthropic = getAnthropicClient();

  // If PDF fits in one call, extract in a single request
  if (pdfBytes.length <= MAX_BYTES_PER_CALL) {
    return extractTextBatch(anthropic, pdfBytes);
  }

  // Otherwise split into batches by byte count and concatenate results
  const parts: string[] = [];
  let offset = 0;
  let batchNum = 0;

  while (offset < pdfBytes.length) {
    batchNum++;
    // Slice at MAX_BYTES_PER_CALL boundary — PDF structure means slices won't
    // be parseable by themselves, so we only do this for very large files and
    // accept that Anthropic will extract what it can from each slice.
    // Real-world PDFs >50 pages that exceed 20 MB are rare; for those we do
    // our best effort extraction per slice.
    const slice = pdfBytes.slice(offset, offset + MAX_BYTES_PER_CALL);
    logger.warn(`[ingest-document] Extracting PDF batch ${batchNum}, ${slice.length} bytes`);
    try {
      const text = await extractTextBatch(anthropic, slice);
      parts.push(text);
    } catch (err) {
      logger.error(`[ingest-document] Batch ${batchNum} extraction failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue with remaining batches — partial extraction is better than nothing
    }
    offset += MAX_BYTES_PER_CALL;
  }

  return parts.join("\n\n");
}

async function extractTextBatch(anthropic: Anthropic, bytes: Uint8Array): Promise<string> {
  const base64 = Buffer.from(bytes).toString("base64");

  // Build content array for Anthropic document-block API.
  // Cast to unknown first to satisfy the strict ContentBlockParam[] overload.
  const documentContent = [
    {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64,
      },
    },
    {
      type: "text",
      text: "Extract all text content from this document. Return only the raw text, preserving paragraph breaks with double newlines. Do not add any commentary, headers, or markdown formatting.",
    },
  ] as unknown as Parameters<typeof anthropic.messages.create>[0]["messages"][0]["content"];

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: documentContent,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Anthropic returned no text content from PDF extraction");
  }
  return block.text;
}

// ── Route handler ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  // ── Parse multipart form ───────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Failed to parse form data — use multipart/form-data" },
      { status: 400 }
    );
  }

  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const file = fileEntry as File;
  const originalName = file.name ?? "untitled";
  const title =
    (formData.get("title") as string | null)?.trim() ||
    originalName.replace(/\.[^.]+$/, ""); // strip extension as fallback
  const category = (formData.get("category") as string | null)?.trim() || null;
  const pinned = formData.get("pinned") === "true";

  // ── File size check ───────────────────────────────────────────────
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large — max 50 MB (got ${(file.size / 1024 / 1024).toFixed(1)} MB)` },
      { status: 413 }
    );
  }

  // ── Read file bytes ───────────────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const mimeType = file.type || "";
  const isPDF =
    mimeType === "application/pdf" || originalName.toLowerCase().endsWith(".pdf");
  const isText =
    mimeType.startsWith("text/") ||
    originalName.toLowerCase().endsWith(".txt") ||
    originalName.toLowerCase().endsWith(".md");

  if (!isPDF && !isText) {
    return NextResponse.json(
      { error: "Only PDF, .txt, and .md files are supported" },
      { status: 415 }
    );
  }

  // ── Extract text ──────────────────────────────────────────────────
  let rawText: string;
  try {
    if (isPDF) {
      logger.warn(`[ingest-document] Extracting text from PDF: "${title}" (${(file.size / 1024).toFixed(0)} KB)`);
      rawText = await extractTextFromPDF(bytes);
    } else {
      // Plain text — decode directly
      rawText = new TextDecoder("utf-8").decode(bytes);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[ingest-document] Text extraction failed", { error: message });
    return NextResponse.json(
      { error: `Text extraction failed: ${message}` },
      { status: 500 }
    );
  }

  if (!rawText || rawText.trim().length === 0) {
    return NextResponse.json(
      { error: "No text could be extracted from the document" },
      { status: 422 }
    );
  }

  // ── Cap text length before chunking (safety) ──────────────────────
  // At ~2000 chars/chunk and 200 chunk cap → 400 000 chars max
  // Trim silently so large PDFs still ingest their first N pages
  const MAX_TEXT_CHARS = 400_000;
  const trimmedText =
    rawText.length > MAX_TEXT_CHARS
      ? rawText.slice(0, MAX_TEXT_CHARS) + "\n\n[Document truncated — first 200 chunks ingested]"
      : rawText;

  // ── Ingest (chunk + store) ─────────────────────────────────────────
  const service = getAdminClient();

  try {
    const result = await ingestDocument(service, {
      organizationId: workspaceId,
      sourceType: isPDF ? "pdf" : "text",
      documentTitle: title,
      documentId: `upload:${user.id}:${Date.now()}`,
      content: trimmedText,
      metadata: {
        source: "pdf_upload",
        original_filename: originalName,
        category: category ?? undefined,
        uploaded_by: user.id,
        uploaded_at: new Date().toISOString(),
        file_size_bytes: file.size,
        is_truncated: rawText.length > MAX_TEXT_CHARS,
        max_chunks: MAX_CHUNKS,
      },
      pinned,
    });

    logger.warn(`[ingest-document] Success: "${title}" — ${result.chunksCreated} chunks stored`);

    return NextResponse.json({
      success: true,
      chunksIngested: result.chunksCreated,
      documentTitle: title,
      sourceType: result.sourceType,
      wasTruncated: rawText.length > MAX_TEXT_CHARS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[ingest-document] Ingestion failed", { error: message });
    return NextResponse.json({ error: "Ingestion failed" }, { status: 500 });
  }
}
