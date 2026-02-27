/**
 * GET /api/brain/embed-documents
 * ================================
 * Background embedding job — generates n-gram embeddings for document_chunks
 * rows where embedding IS NULL. Called by the nightly brain-refresh workflow
 * and can also be triggered manually post-ingest.
 *
 * Security: Protected by Bearer CRON_SECRET header.
 *
 * Processing:
 *   - Fetches up to 50 un-embedded chunks per call (stays within Lambda timeout)
 *   - Generates 1536-dim n-gram embeddings (no API required)
 *   - Updates each chunk row in-place with the embedding vector
 *   - Returns counts: { processed, failed, remaining }
 *
 * Idempotent: safe to call repeatedly — only processes NULL-embedding rows.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { generateEmbedding } from "@nexus-ai/memory-stack/embeddings";
import { reduceDimensions } from "@nexus-ai/memory-stack/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — 50 chunks × ~100ms each is well under this

const BATCH_SIZE = 50;   // Max chunks per invocation (Lambda timeout guard)
const EMBEDDING_DIMS = 1536;
const NGRAM_DIMS = 384;

function generateChunkEmbedding(text: string): string {
  const ngram = generateEmbedding(text, NGRAM_DIMS);
  const padded = reduceDimensions(ngram, EMBEDDING_DIMS);
  return `[${padded.join(",")}]`;
}

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminClient();

  // ── Fetch un-embedded chunks (any org) ──────────────────────────────
  const { data: chunks, error: fetchError } = await supabase
    .from("document_chunks")
    .select("id, chunk_text")
    .is("embedding", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError) {
    logger.error("[embed-documents] Failed to fetch un-embedded chunks", {
      error: fetchError.message,
    });
    return NextResponse.json({ error: "Failed to fetch chunks" }, { status: 500 });
  }

  if (!chunks || chunks.length === 0) {
    logger.warn("[embed-documents] No un-embedded chunks found — all caught up");
    return NextResponse.json({ processed: 0, failed: 0, remaining: 0 });
  }

  logger.warn(`[embed-documents] Processing ${chunks.length} un-embedded chunks`);

  let processed = 0;
  let failed = 0;

  for (const chunk of chunks) {
    try {
      const embeddingStr = generateChunkEmbedding(chunk.chunk_text as string);

      const { error: updateError } = await supabase
        .from("document_chunks")
        .update({ embedding: embeddingStr })
        .eq("id", chunk.id);

      if (updateError) {
        logger.warn("[embed-documents] Failed to update chunk embedding", {
          chunkId: chunk.id,
          error: updateError.message,
        });
        failed++;
      } else {
        processed++;
      }
    } catch (err) {
      logger.warn("[embed-documents] Embedding generation error", {
        chunkId: chunk.id,
        error: err instanceof Error ? err.message : String(err),
      });
      failed++;
    }
  }

  // Count remaining un-embedded chunks (for monitoring)
  const { count: remainingCount } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);

  const remaining = remainingCount ?? 0;

  logger.warn(`[embed-documents] Done: processed=${processed}, failed=${failed}, remaining=${remaining}`);

  return NextResponse.json({ processed, failed, remaining });
}
