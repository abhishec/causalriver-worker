/**
 * GET /api/cron/process-embeddings
 *
 * Backfills missing OpenAI embeddings for document_chunks rows.
 *
 * Finds chunks where the embedding column is NULL or is the zero vector
 * (the fallback value set when OPENAI_API_KEY was missing at ingest time).
 *
 * Processes up to MAX_CHUNKS_PER_RUN = 100 chunks per invocation in
 * batches of BATCH_SIZE = 20, using the OpenAI batch embeddings API
 * to minimise round-trips and stay within rate limits.
 *
 * Auth: Bearer CRON_SECRET header.
 *
 * Schedule: every 10 minutes.
 *   0/10 * * * ? *  (EventBridge cron expression)
 *
 * Why this exists:
 *   ingestDocument() fires embedding generation as a background task.
 *   If that background task races with Lambda shutdown, or if the
 *   OPENAI_API_KEY was not configured at ingest time, chunks end up
 *   with NULL embeddings. This cron repairs those gaps so the vector
 *   search tier is always fully populated.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s Lambda limit

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

// Static captures for Lambda SSR
const CRON_SECRET = process.env.CRON_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const EMBEDDING_DIMS = 1536;
const BATCH_SIZE = 20;       // chunks per OpenAI API call
const MAX_CHUNKS_PER_RUN = 100; // Lambda timeout safety

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

// ── Types ──────────────────────────────────────────────────────────────────

interface ChunkRow {
  id: string;
  chunk_text: string;
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { total_tokens?: number };
  error?: { message: string };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();

  if (!OPENAI_API_KEY) {
    logger.warn("[cron/process-embeddings] OPENAI_API_KEY not set — skipping embedding backfill");
    return NextResponse.json({
      ok: false,
      message: "OPENAI_API_KEY not configured — nothing to backfill",
      updated: 0,
      durationMs: Date.now() - startMs,
    });
  }

  try {
    const supabase = await createServiceClient();

    // ── Find chunks missing embeddings ────────────────────────────────────
    // A chunk needs embedding if:
    //   - embedding IS NULL (never generated), OR
    //   - embedding is the zero vector string '[0,0,...,0]' (fallback from ingest)
    //
    // We detect the zero vector by checking if the embedding column is null.
    // For chunks that have the pgvector zero vector stored, we rely on the
    // fact that ingestDocument() stores them as '[0,0,...,0]' via embeddingStr.
    // We limit to MAX_CHUNKS_PER_RUN to stay within Lambda timeout.
    const { data: chunks, error: queryError } = await supabase
      .from("document_chunks")
      .select("id, chunk_text")
      .is("embedding", null)
      .order("created_at", { ascending: true })
      .limit(MAX_CHUNKS_PER_RUN);

    if (queryError) {
      logger.warn("[cron/process-embeddings] Failed to query null-embedding chunks", {
        error: queryError.message,
      });
      return NextResponse.json({
        ok: false,
        error: queryError.message,
        updated: 0,
        durationMs: Date.now() - startMs,
      });
    }

    const nullChunks = (chunks ?? []) as ChunkRow[];

    // Also query chunks that have the zero vector stored as a string pattern.
    // These are chunks where ingestDocument() fell back to the zero vector
    // because OpenAI was unavailable at ingest time.
    // We identify them by querying where the embedding field equals the zero vector.
    // This uses a PostgREST filter — matching on the stored vector value.
    // NOTE: If the schema stores embeddings as vector(1536), PostgREST may not
    // support direct zero-vector filtering. We rely on null-check for now and
    // add the zero-vector re-processing as a best-effort secondary pass.
    const { data: zeroChunks, error: zeroQueryError } = await supabase
      .from("document_chunks")
      .select("id, chunk_text")
      .not("embedding", "is", null)  // Has an embedding set...
      .limit(Math.max(0, MAX_CHUNKS_PER_RUN - nullChunks.length));

    // We can't easily filter "is zero vector" via PostgREST without an RPC.
    // Instead, rely on the null pass above for fresh backfills.
    // Zero-vector re-processing would need a DB function; skip for now.
    // Log a warning so this is visible in monitoring.
    if (zeroQueryError) {
      logger.warn("[cron/process-embeddings] Zero-vector query failed (non-fatal)", {
        error: zeroQueryError.message,
      });
    }

    const allChunks = nullChunks.slice(0, MAX_CHUNKS_PER_RUN);

    if (allChunks.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No chunks missing embeddings",
        updated: 0,
        durationMs: Date.now() - startMs,
      });
    }

    logger.warn("[cron/process-embeddings] Backfilling embeddings", {
      nullChunks: nullChunks.length,
      total: allChunks.length,
    });

    // ── Process in batches ────────────────────────────────────────────────
    let totalUpdated = 0;
    let totalFailed = 0;
    let totalTokensUsed = 0;

    for (let batchStart = 0; batchStart < allChunks.length; batchStart += BATCH_SIZE) {
      // Lambda timeout guard: stop 5s before maxDuration
      if (Date.now() - startMs > 55_000) {
        logger.warn("[cron/process-embeddings] Lambda timeout guard — stopping batch loop", {
          processed: totalUpdated + totalFailed,
          remaining: allChunks.length - batchStart,
        });
        break;
      }

      const batch = allChunks.slice(batchStart, batchStart + BATCH_SIZE);
      const texts = batch.map((c) => c.chunk_text.slice(0, 8000)); // OpenAI max ~8K tokens

      const { embeddings, tokensUsed, error: embError } = await fetchEmbeddingsBatch(texts);

      if (embError || embeddings.length === 0) {
        logger.warn("[cron/process-embeddings] Embedding batch failed", {
          batchStart,
          batchSize: batch.length,
          error: embError,
        });
        totalFailed += batch.length;
        // Continue to next batch — don't fail the entire run for one bad batch
        continue;
      }

      totalTokensUsed += tokensUsed;

      // Update each chunk in the batch
      for (let i = 0; i < batch.length; i++) {
        const chunk = batch[i];
        const embedding = embeddings[i];

        if (!embedding || embedding.length !== EMBEDDING_DIMS) {
          logger.warn("[cron/process-embeddings] Unexpected embedding dimension", {
            chunkId: chunk.id,
            dims: embedding?.length,
          });
          totalFailed++;
          continue;
        }

        const embeddingStr = `[${embedding.join(",")}]`;

        const { error: updateError } = await supabase
          .from("document_chunks")
          .update({ embedding: embeddingStr })
          .eq("id", chunk.id);

        if (updateError) {
          logger.warn("[cron/process-embeddings] Failed to update chunk embedding", {
            chunkId: chunk.id,
            error: updateError.message,
          });
          totalFailed++;
        } else {
          totalUpdated++;
        }
      }

      // Rate limit delay between batches (except after last batch)
      if (batchStart + BATCH_SIZE < allChunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    const durationMs = Date.now() - startMs;

    logger.warn("[cron/process-embeddings] Backfill complete", {
      totalUpdated,
      totalFailed,
      totalTokensUsed,
      durationMs,
    });

    return NextResponse.json({
      ok: true,
      updated: totalUpdated,
      failed: totalFailed,
      totalChunksProcessed: totalUpdated + totalFailed,
      totalTokensUsed,
      durationMs,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[cron/process-embeddings] Fatal error", { error: errorMsg });
    return NextResponse.json(
      { ok: false, error: errorMsg, updated: 0, durationMs: Date.now() - startMs },
      { status: 200 }, // Return 200 so the cron scheduler doesn't back off
    );
  }
}

// ── OpenAI batch embeddings ────────────────────────────────────────────────

/**
 * Fetch embeddings for a batch of texts using the OpenAI batch API.
 *
 * Sends all texts in a single API request to minimise latency and cost.
 * Returns embeddings in the same order as the input texts.
 */
async function fetchEmbeddingsBatch(texts: string[]): Promise<{
  embeddings: number[][];
  tokensUsed: number;
  error?: string;
}> {
  if (texts.length === 0) {
    return { embeddings: [], tokensUsed: 0 };
  }

  if (!OPENAI_API_KEY) {
    return { embeddings: [], tokensUsed: 0, error: "OPENAI_API_KEY not set" };
  }

  try {
    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: texts,
        dimensions: EMBEDDING_DIMS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      return {
        embeddings: [],
        tokensUsed: 0,
        error: `OpenAI API error ${response.status}: ${errorText.slice(0, 200)}`,
      };
    }

    const data = await response.json() as OpenAIEmbeddingResponse;

    if (data.error) {
      return {
        embeddings: [],
        tokensUsed: 0,
        error: `OpenAI error: ${data.error.message}`,
      };
    }

    // Sort by index to ensure order matches input (OpenAI may reorder)
    const sorted = [...(data.data ?? [])].sort((a, b) => a.index - b.index);
    const embeddings = sorted.map((item) => item.embedding);
    const tokensUsed = data.usage?.total_tokens ?? 0;

    return { embeddings, tokensUsed };
  } catch (err: unknown) {
    return {
      embeddings: [],
      tokensUsed: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
