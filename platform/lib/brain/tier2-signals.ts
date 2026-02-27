/**
 * Tier 2 — Semantic Signals
 * ==========================
 * Provides semantic search over `knowledge_chunks` and utility tracking
 * for both `knowledge_chunks` and `document_chunks`.
 *
 * Search strategy:
 *   1. Generate embedding via OpenAI text-embedding-3-small
 *   2. Call `search_knowledge_chunks` RPC (cosine similarity, ivfflat index)
 *   3. Fallback to recency-ordered keyword fetch when embedding unavailable
 *
 * Utility tracking feeds the Tier 3 consolidation engine: chunks that are
 * referenced frequently with high quality become consolidation candidates.
 */

import { logger } from "@/lib/logger";
import { getAdminClient } from "@/lib/supabase/admin";

// ── Constants ─────────────────────────────────────────────────────────────────

const EMBEDDING_DIMS = 1536;
const MAX_TEXT_CHARS = 8000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KnowledgeChunkResult {
  id: string;
  source_type: string;
  verbatim_text: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

// ── Embedding helper (exported for Tier 1 reuse) ──────────────────────────────

/**
 * Produce a 1536-dim embedding via OpenAI text-embedding-3-small.
 * Returns null on failure so callers can fall back to keyword search.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn("[tier2-signals] OPENAI_API_KEY not set — embedText returning null");
    return null;
  }
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.slice(0, MAX_TEXT_CHARS),
        dimensions: EMBEDDING_DIMS,
      }),
    });
    if (!res.ok) {
      logger.warn("[tier2-signals] OpenAI embedding request failed", {
        status: res.status,
        statusText: res.statusText,
      });
      return null;
    }
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    const vec = data.data[0]?.embedding;
    return vec && vec.length === EMBEDDING_DIMS ? vec : null;
  } catch (err) {
    logger.warn("[tier2-signals] embedText threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ── Semantic search ───────────────────────────────────────────────────────────

/**
 * Semantic search over `knowledge_chunks` for an org.
 *
 * Primary path  — vector similarity via `search_knowledge_chunks` RPC.
 * Fallback path — most-recent chunks (similarity = 0) when no embedding.
 *
 * Never throws. Returns an empty array on error.
 */
export async function searchKnowledgeChunks(
  orgId: string,
  query: string,
  limit = 5
): Promise<KnowledgeChunkResult[]> {
  try {
    // Admin client bypasses RLS — knowledge_chunks has no user-scoped RLS; server-side semantic search.
    const admin = getAdminClient();
    const embedding = await embedText(query);

    if (embedding) {
      const embeddingStr = `[${embedding.join(",")}]`;

      const { data, error } = await admin.rpc("search_knowledge_chunks", {
        p_organization_id: orgId,
        query_embedding: embeddingStr,
        match_count: limit,
      });

      if (!error && data) {
        return (
          data as Array<{
            id: string;
            source_type: string;
            verbatim_text: string;
            similarity: number;
            metadata: Record<string, unknown>;
          }>
        ).map((row) => ({
          id: row.id,
          source_type: row.source_type,
          verbatim_text: row.verbatim_text,
          similarity: row.similarity,
          metadata: row.metadata ?? {},
        }));
      }

      if (error) {
        logger.warn("[tier2-signals] search_knowledge_chunks RPC failed", {
          orgId,
          error: error.message,
        });
      }
    }

    // Fallback: recency-ordered select — no embedding available or RPC failed
    const { data: fallbackData, error: fallbackError } = await admin
      .from("knowledge_chunks")
      .select("id, source_type, verbatim_text, metadata")
      .eq("organization_id", orgId)
      .order("ingested_at", { ascending: false })
      .limit(limit);

    if (fallbackError) {
      logger.warn("[tier2-signals] fallback knowledge_chunks select failed", {
        orgId,
        error: fallbackError.message,
      });
      return [];
    }

    return (fallbackData ?? []).map((row) => ({
      id: row.id as string,
      source_type: row.source_type as string,
      verbatim_text: row.verbatim_text as string,
      similarity: 0,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    }));
  } catch (err) {
    logger.warn("[tier2-signals] searchKnowledgeChunks threw", {
      orgId,
      error: String(err),
    });
    return [];
  }
}

// ── Utility tracking ──────────────────────────────────────────────────────────

/**
 * Record that a chunk was used in an execution with a given quality score.
 *
 * Updates:
 *   - `reference_count` (+1)
 *   - `avg_quality`     (rolling average)
 *   - `last_referenced_at`
 *   - `consolidation_candidate` (true when count >= 3 AND avg_quality >= 0.72)
 *
 * Fire-and-forget safe — never throws.
 */
export async function recordChunkUsage(
  chunkId: string,
  quality: number,
  table: "knowledge_chunks" | "document_chunks"
): Promise<void> {
  try {
    // Admin client bypasses RLS — knowledge_chunks/document_chunks have no user-scoped RLS;
    // this is a fire-and-forget RL quality tracking update from a background job.
    const admin = getAdminClient();

    // Read current stats — single() is safe because id is the PK
    const { data, error: readError } = await admin
      .from(table)
      .select("reference_count, avg_quality")
      .eq("id", chunkId)
      .single();

    if (readError) {
      logger.warn("[tier2-signals] recordChunkUsage read failed", {
        chunkId,
        table,
        error: readError.message,
      });
      return;
    }

    const prevCount: number = (data?.reference_count as number) ?? 0;
    const prevAvg: number = (data?.avg_quality as number) ?? 0;
    const newCount = prevCount + 1;
    const newAvg = (prevAvg * prevCount + quality) / newCount;
    const isCandidate = newCount >= 3 && newAvg >= 0.72;

    const { error: updateError } = await admin
      .from(table)
      .update({
        reference_count: newCount,
        avg_quality: newAvg,
        last_referenced_at: new Date().toISOString(),
        consolidation_candidate: isCandidate,
      })
      .eq("id", chunkId);

    if (updateError) {
      logger.warn("[tier2-signals] recordChunkUsage update failed", {
        chunkId,
        table,
        error: updateError.message,
      });
    }
  } catch (err) {
    logger.warn("[tier2-signals] recordChunkUsage threw", {
      chunkId,
      table,
      error: String(err),
    });
  }
}
