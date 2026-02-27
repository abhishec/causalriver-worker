/**
 * GET /api/brain/embed-documents
 * ================================
 * Background embedding job — generates OpenAI text-embedding-3-small embeddings for
 * document_chunks rows where embedding IS NULL. Called by the nightly brain-refresh
 * workflow and can also be triggered manually post-ingest.
 *
 * Security: Protected by Bearer CRON_SECRET header.
 *
 * Processing:
 *   - Fetches up to 50 un-embedded chunks per call (stays within Lambda timeout)
 *   - Generates real 1536-dim semantic embeddings via OpenAI text-embedding-3-small
 *   - Processes in batches of 10 with 100ms delay (rate limit safety)
 *   - Updates each chunk row in-place with the embedding vector
 *   - Returns counts: { processed, failed, remaining }
 *
 * Idempotent: safe to call repeatedly — only processes NULL-embedding rows.
 * Cost: ~$0.02 per 1M tokens — negligible vs quality gain over n-gram hashing.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — 50 chunks with API calls fits comfortably

const BATCH_SIZE = 50;          // Max chunks per invocation (Lambda timeout guard)
const EMBEDDING_DIMS = 1536;
const EMBEDDING_BATCH_SIZE = 10;       // chunks per OpenAI batch
const EMBEDDING_BATCH_DELAY_MS = 100;  // ms between batches (rate limit safety)

/**
 * Generate a real semantic embedding using OpenAI text-embedding-3-small.
 * Returns a 1536-dim float array.
 * Fallback: zero vector when API key is missing or request fails.
 */
async function generateRealEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn("[embed-documents] OPENAI_API_KEY not set — returning zero vector fallback");
    return new Array(EMBEDDING_DIMS).fill(0);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.slice(0, 8000), // max ~8K tokens
        dimensions: EMBEDDING_DIMS,
      }),
    });

    if (!response.ok) {
      logger.warn("[embed-documents] OpenAI embedding request failed", {
        status: response.status,
        statusText: response.statusText,
      });
      return new Array(EMBEDDING_DIMS).fill(0);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0]?.embedding ?? new Array(EMBEDDING_DIMS).fill(0);
  } catch (err) {
    logger.warn("[embed-documents] OpenAI embedding error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Array(EMBEDDING_DIMS).fill(0);
  }
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

  logger.warn(`[embed-documents] Processing ${chunks.length} un-embedded chunks via OpenAI text-embedding-3-small`);

  let processed = 0;
  let failed = 0;

  for (let batchStart = 0; batchStart < chunks.length; batchStart += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(batchStart, batchStart + EMBEDDING_BATCH_SIZE);

    for (const chunk of batch) {
      try {
        const embedding = await generateRealEmbedding(chunk.chunk_text as string);
        const embeddingStr = `[${embedding.join(",")}]`;

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

    // Rate limit safety: pause between batches (skip delay after last batch)
    if (batchStart + EMBEDDING_BATCH_SIZE < chunks.length) {
      await new Promise((resolve) => setTimeout(resolve, EMBEDDING_BATCH_DELAY_MS));
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
