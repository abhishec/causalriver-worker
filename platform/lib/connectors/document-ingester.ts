/**
 * Document Ingester
 * =================
 * Chunks large documents into searchable segments for BrainContextMesh retrieval.
 *
 * Chunking strategy:
 * - Target: 512 tokens per chunk (~2000 chars)
 * - Overlap: 50 tokens (~200 chars) to preserve context across boundaries
 * - Split on: paragraph breaks > sentence breaks > word boundaries
 *
 * Embedding strategy:
 * - OpenAI text-embedding-3-small (1536-dim) — real semantic embeddings
 * - Embeddings are generated asynchronously (not blocking ingestion)
 * - Full-text search (tsvector) is used immediately
 * - Vector similarity search (cosine) activates once embeddings are stored
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { absorbDocumentChunks } from "@/lib/brain/document-absorber";
import { chunkCodeFile, detectLanguage } from "@/lib/brain/code-chunker";

// File extensions that trigger AST-aware chunking instead of naive paragraph splitting.
const CODE_EXTS_FOR_AST = new Set(["ts", "tsx", "js", "jsx"]);

// document_chunks.embedding is vector(1536).
// OpenAI text-embedding-3-small produces exactly 1536 dimensions — no padding needed.
const EMBEDDING_DIMS = 1536;
const EMBEDDING_BATCH_SIZE = 10;   // chunks per OpenAI batch (rate limit safety)
const EMBEDDING_BATCH_DELAY_MS = 100; // ms between batches

/**
 * Generate a real semantic embedding using OpenAI text-embedding-3-small.
 * Returns a 1536-dim float array.
 *
 * Fallback: zero vector when API key is missing or request fails.
 * Zero vector is better than n-gram noise — it avoids polluting cosine similarity rankings.
 */
async function generateRealEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn("[document-ingester] OPENAI_API_KEY not set — returning zero vector fallback");
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
      logger.warn("[document-ingester] OpenAI embedding request failed", {
        status: response.status,
        statusText: response.statusText,
      });
      return new Array(EMBEDDING_DIMS).fill(0);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0]?.embedding ?? new Array(EMBEDDING_DIMS).fill(0);
  } catch (err) {
    logger.warn("[document-ingester] OpenAI embedding error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Array(EMBEDDING_DIMS).fill(0);
  }
}

/**
 * Background: generate and store OpenAI embeddings for a list of chunk IDs.
 * Fire-and-forget — called with void to not block the ingest response.
 * Processes in batches of EMBEDDING_BATCH_SIZE with a short delay between batches.
 */
async function generateEmbeddingsForChunks(
  supabase: SupabaseClient,
  chunkIds: string[],
  chunkTexts: string[]
): Promise<void> {
  for (let batchStart = 0; batchStart < chunkIds.length; batchStart += EMBEDDING_BATCH_SIZE) {
    const batchIds = chunkIds.slice(batchStart, batchStart + EMBEDDING_BATCH_SIZE);
    const batchTexts = chunkTexts.slice(batchStart, batchStart + EMBEDDING_BATCH_SIZE);

    for (let i = 0; i < batchIds.length; i++) {
      try {
        const embedding = await generateRealEmbedding(batchTexts[i]);
        const embeddingStr = `[${embedding.join(",")}]`;

        const { error } = await supabase
          .from("document_chunks")
          .update({ embedding: embeddingStr })
          .eq("id", batchIds[i]);

        if (error) {
          logger.warn("[document-ingester] Failed to update embedding for chunk", {
            chunkId: batchIds[i],
            error: error.message,
          });
        }
      } catch (err) {
        logger.warn("[document-ingester] Embedding generation failed for chunk", {
          chunkId: batchIds[i],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Rate limit safety: pause between batches (skip delay after last batch)
    if (batchStart + EMBEDDING_BATCH_SIZE < chunkIds.length) {
      await new Promise((resolve) => setTimeout(resolve, EMBEDDING_BATCH_DELAY_MS));
    }
  }
}

const CHUNK_TARGET_CHARS = 2000;   // ~512 tokens
const CHUNK_OVERLAP_CHARS = 200;   // ~50 tokens overlap

export interface IngestDocumentParams {
  organizationId: string;
  sourceUrl?: string;
  sourceType: "pdf" | "confluence" | "github" | "markdown" | "text";
  documentTitle?: string;
  documentId?: string;
  content: string;  // raw text content
  metadata?: Record<string, unknown>;
  pinned?: boolean;
}

export interface IngestResult {
  chunksCreated: number;
  documentTitle: string;
  sourceType: string;
}

/**
 * Chunk a document into overlapping segments.
 */
export function chunkDocument(text: string): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = "";

  for (const para of paragraphs) {
    if ((currentChunk + "\n\n" + para).length > CHUNK_TARGET_CHARS && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Overlap: keep last N chars of current chunk
      const overlap = currentChunk.slice(-CHUNK_OVERLAP_CHARS);
      currentChunk = overlap + "\n\n" + para;
    } else {
      currentChunk = currentChunk ? currentChunk + "\n\n" + para : para;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // If no paragraph breaks found, split by sentences
  if (chunks.length === 0 && text.length > 0) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
    let buf = "";
    for (const sent of sentences) {
      if ((buf + sent).length > CHUNK_TARGET_CHARS && buf.length > 0) {
        chunks.push(buf.trim());
        buf = buf.slice(-CHUNK_OVERLAP_CHARS) + sent;
      } else {
        buf += sent;
      }
    }
    if (buf.trim()) chunks.push(buf.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Ingest a document: chunk it and store in document_chunks table.
 *
 * For TypeScript/JavaScript files (detected from documentTitle extension),
 * uses AST-aware chunking (ts-morph) to split at function/class/interface
 * boundaries instead of naive paragraph breaks. All other file types use
 * the standard paragraph-based chunker.
 */
export async function ingestDocument(
  supabase: SupabaseClient,
  params: IngestDocumentParams
): Promise<IngestResult> {
  // ── Choose chunker based on file type ──────────────────────────────────
  // AST chunking for TS/JS: keeps functions and classes intact in one chunk,
  // which dramatically improves retrieval recall for code RAG queries.
  const titleForExt = params.documentTitle ?? params.sourceUrl ?? "";
  const ext = titleForExt.split(".").pop()?.toLowerCase() ?? "";
  const useAstChunker = CODE_EXTS_FOR_AST.has(ext) && params.content.trim().length > 0;

  let chunks: string[];

  if (useAstChunker) {
    try {
      const lang = detectLanguage(titleForExt);
      const astChunks = await chunkCodeFile(titleForExt, params.content);
      if (astChunks.length > 0) {
        chunks = astChunks.map((c) => c.content);
        logger.warn(`[document-ingester] AST chunked "${titleForExt}" (${lang}): ${astChunks.length} semantic chunks`);
      } else {
        // ts-morph returned nothing (empty file) — fall through to naive chunker
        chunks = chunkDocument(params.content);
      }
    } catch (err) {
      logger.warn("[document-ingester] AST chunking failed, falling back to naive chunker", {
        file: titleForExt,
        error: err instanceof Error ? err.message : String(err),
      });
      chunks = chunkDocument(params.content);
    }
  } else {
    chunks = chunkDocument(params.content);
  }

  const rows = chunks.map((text, index) => ({
    organization_id: params.organizationId,
    source_url: params.sourceUrl ?? null,
    source_type: params.sourceType,
    document_title: params.documentTitle ?? null,
    document_id: params.documentId ?? null,
    chunk_index: index,
    chunk_text: text,
    chunk_tokens: Math.ceil(text.length / 4),  // rough estimate
    metadata: { ...params.metadata, total_chunks: chunks.length },
    pinned: params.pinned ?? false,
  }));

  const { data: insertedRows, error } = await supabase
    .from("document_chunks")
    .insert(rows)
    .select("id, chunk_text");

  if (error) {
    throw new Error(`Failed to ingest document: ${error.message}`);
  }

  logger.warn(`[document-ingester] Ingested ${chunks.length} chunks from "${params.documentTitle ?? params.sourceUrl ?? "unknown"}"`);

  // Background: generate OpenAI embeddings for each chunk (non-blocking).
  // The ingest response returns immediately; embeddings are populated async.
  if (insertedRows && insertedRows.length > 0) {
    const ids = insertedRows.map((r: { id: string }) => r.id);
    const texts = insertedRows.map((r: { chunk_text: string }) => r.chunk_text);
    void generateEmbeddingsForChunks(supabase, ids, texts);
  }

  // Background: extract structured knowledge from chunks → brain memory.
  // Non-blocking fire-and-forget — absorption runs after response returns.
  void absorbDocumentChunks(
    supabase,
    params.organizationId,
    params.documentTitle ?? params.sourceUrl ?? "unknown",
    rows.map((r) => ({ id: String(r.chunk_index), chunk_text: r.chunk_text, chunk_index: r.chunk_index })),
    params.sourceType
  ).catch((err: unknown) =>
    logger.warn("[document-ingester] absorbDocumentChunks fire-and-forget failed (non-fatal):", String(err))
  );

  return {
    chunksCreated: chunks.length,
    documentTitle: params.documentTitle ?? params.sourceUrl ?? "unknown",
    sourceType: params.sourceType,
  };
}

/**
 * Search document chunks — hybrid BM25+vector first, then vector-only, then tsvector.
 *
 * Priority:
 *   1. Hybrid search via search_document_chunks_hybrid RPC (BM25 + vector via RRF)
 *      → Catches exact names (Alice Johnson, sprint-42) AND semantic matches
 *   2. Vector-only search via search_document_chunks RPC (semantic fallback)
 *      → Used when hybrid RPC is unavailable or returns empty
 *   3. Full-text tsvector search (lexical fallback when embeddings missing)
 *   4. Recency fetch (when query is empty — context priming)
 *
 * Called by getBrainContext() to include document knowledge in every LLM decision.
 */
export async function searchDocumentChunks(
  supabase: SupabaseClient,
  organizationId: string,
  query: string,
  limit = 5
): Promise<Array<{ chunk_text: string; document_title: string | null; chunk_index: number; source_type: string }>> {
  // Empty query: return most recently ingested chunks (used by getBrainContext for context priming)
  if (!query.trim()) {
    const { data, error } = await supabase
      .from("document_chunks")
      .select("chunk_text, document_title, chunk_index, source_type")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn("[document-ingester] searchDocumentChunks (recent) failed", { error: error.message });
      return [];
    }
    return data ?? [];
  }

  // Non-empty query: generate embedding once, reuse across all search tiers
  let queryEmbeddingArr: number[] = new Array(1536).fill(0);
  let embeddingReady = false;
  try {
    queryEmbeddingArr = await generateRealEmbedding(query);
    embeddingReady = queryEmbeddingArr.some(v => v !== 0);
  } catch (embErr) {
    logger.warn("[document-ingester] Embedding generation failed, will use BM25/tsvector only", {
      error: embErr instanceof Error ? embErr.message : String(embErr),
    });
  }

  const queryEmbedding = `[${queryEmbeddingArr.join(",")}]`;

  // ── Tier 1: Hybrid search (BM25 + vector via Reciprocal Rank Fusion) ──────
  // Catches exact proper nouns, IDs, sprint names AND semantic matches.
  // Falls through if RPC not available (before migration runs) or returns 0.
  if (embeddingReady) {
    try {
      const { data: hybridData, error: hybridError } = await supabase
        .rpc("search_document_chunks_hybrid", {
          query_text: query,
          query_embedding: queryEmbedding,
          p_org_id: organizationId,
          p_limit: limit,
          vector_weight: 0.6,
          bm25_weight: 0.4,
        });

      if (!hybridError && hybridData && hybridData.length > 0) {
        logger.warn("[document-ingester] searchDocumentChunks: hybrid search returned results", {
          count: hybridData.length,
        });
        return hybridData as Array<{ chunk_text: string; document_title: string | null; chunk_index: number; source_type: string }>;
      }

      if (hybridError) {
        logger.warn("[document-ingester] Hybrid search failed, falling back to vector-only", {
          error: hybridError.message,
        });
      } else {
        logger.warn("[document-ingester] Hybrid search returned 0 results — falling back to vector-only");
      }
    } catch (hybridErr) {
      logger.warn("[document-ingester] Hybrid search threw, falling back to vector-only", {
        error: hybridErr instanceof Error ? hybridErr.message : String(hybridErr),
      });
    }
  }

  // ── Tier 2: Vector-only search (semantic similarity) ─────────────────────
  // Used when hybrid returned empty or embedding was not ready for hybrid.
  if (embeddingReady) {
    try {
      const { data: vectorData, error: vectorError } = await supabase
        .rpc("search_document_chunks", {
          p_organization_id: organizationId,
          query_embedding: queryEmbedding,
          match_count: limit,
        });

      if (!vectorError && vectorData && vectorData.length > 0) {
        logger.warn("[document-ingester] searchDocumentChunks: vector-only search returned results", {
          count: vectorData.length,
        });
        return vectorData as Array<{ chunk_text: string; document_title: string | null; chunk_index: number; source_type: string }>;
      }

      if (vectorError) {
        logger.warn("[document-ingester] Vector search failed, falling back to tsvector", {
          error: vectorError.message,
        });
      } else {
        logger.warn("[document-ingester] Vector search returned 0 results — falling back to tsvector");
      }
    } catch (vecErr) {
      logger.warn("[document-ingester] Vector search threw, falling back to tsvector", {
        error: vecErr instanceof Error ? vecErr.message : String(vecErr),
      });
    }
  }

  // ── Tier 3: PostgreSQL full-text search (tsvector) ────────────────────────
  // Always available — search_vector is GENERATED ALWAYS AS on document_chunks.
  // Handles cases where embeddings haven't been generated yet.
  const { data, error } = await supabase
    .from("document_chunks")
    .select("chunk_text, document_title, chunk_index, source_type")
    .eq("organization_id", organizationId)
    .textSearch("search_vector", query.split(" ").join(" | "), { type: "websearch" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn("[document-ingester] searchDocumentChunks tsvector fallback failed", { error: error.message });
    return [];
  }

  return data ?? [];
}

/**
 * Scoped document search — filters to only the agent's corpus.
 *
 * Used by interactive agents to search within their own knowledge scope
 * (a curated set of documents or ingestion jobs) rather than the entire
 * organization corpus. Falls back to global search when no scope provided.
 *
 * Scope filters (applied as AND conditions):
 *   ingestionJobIds — match chunks whose metadata->>'ingestionJobId' is in list
 *   documentIds     — match chunks by document_id column
 *   sourceTypes     — match chunks by source_type column
 *
 * Search is a tsvector full-text search — appropriate for scoped sets because
 * the corpus is small enough that precision matters more than recall ranking.
 */
export async function searchDocumentChunksScoped(
  supabase: SupabaseClient,
  organizationId: string,
  query: string,
  scope?: {
    documentIds?: string[];
    ingestionJobIds?: string[];
    sourceTypes?: string[];
  },
  limit = 5
): Promise<
  Array<{
    chunk_text: string;
    document_title: string | null;
    chunk_index: number;
    source_type: string;
  }>
> {
  // No scope or empty scope: delegate to the full global search
  const hasDocumentIds = (scope?.documentIds?.length ?? 0) > 0;
  const hasIngestionJobIds = (scope?.ingestionJobIds?.length ?? 0) > 0;
  const hasSourceTypes = (scope?.sourceTypes?.length ?? 0) > 0;

  if (!scope || (!hasDocumentIds && !hasIngestionJobIds && !hasSourceTypes)) {
    return searchDocumentChunks(supabase, organizationId, query, limit);
  }

  // Empty query: return most recently ingested chunks within scope
  if (!query.trim()) {
    let recentQuery = supabase
      .from("document_chunks")
      .select("chunk_text, document_title, chunk_index, source_type")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (hasDocumentIds) {
      recentQuery = recentQuery.in("document_id", scope!.documentIds!);
    }
    if (hasSourceTypes) {
      recentQuery = recentQuery.in("source_type", scope!.sourceTypes!);
    }

    const { data, error } = await recentQuery;

    if (error) {
      logger.warn("[document-ingester] searchDocumentChunksScoped (recent) failed", {
        error: error.message,
        organizationId,
      });
      return [];
    }

    // Filter by ingestionJobId post-fetch (metadata JSONB filter not supported via typed client)
    if (hasIngestionJobIds && data) {
      const jobIds = new Set(scope!.ingestionJobIds!);
      return data.filter((row: { chunk_text: string; document_title: string | null; chunk_index: number; source_type: string; metadata?: Record<string, unknown> }) => {
        const meta = (row as { metadata?: Record<string, unknown> }).metadata ?? {};
        return jobIds.has(meta["ingestionJobId"] as string);
      });
    }

    return data ?? [];
  }

  // Non-empty query: tsvector full-text search with scope filters
  let scopedQuery = supabase
    .from("document_chunks")
    .select("chunk_text, document_title, chunk_index, source_type, metadata")
    .eq("organization_id", organizationId)
    .textSearch("search_vector", query.split(" ").join(" | "), { type: "websearch" })
    .order("created_at", { ascending: false })
    .limit(hasIngestionJobIds ? limit * 4 : limit); // over-fetch when we need to post-filter by metadata

  if (hasDocumentIds) {
    scopedQuery = scopedQuery.in("document_id", scope!.documentIds!);
  }
  if (hasSourceTypes) {
    scopedQuery = scopedQuery.in("source_type", scope!.sourceTypes!);
  }

  const { data, error } = await scopedQuery;

  if (error) {
    logger.warn("[document-ingester] searchDocumentChunksScoped tsvector failed", {
      error: error.message,
      organizationId,
      scope,
    });
    // Graceful degradation: fall back to global search
    return searchDocumentChunks(supabase, organizationId, query, limit);
  }

  let results = (data ?? []) as Array<{
    chunk_text: string;
    document_title: string | null;
    chunk_index: number;
    source_type: string;
    metadata?: Record<string, unknown>;
  }>;

  // Post-filter by ingestionJobId (stored in JSONB metadata)
  if (hasIngestionJobIds) {
    const jobIds = new Set(scope!.ingestionJobIds!);
    results = results.filter((row) => {
      const meta = row.metadata ?? {};
      return jobIds.has(meta["ingestionJobId"] as string);
    });
  }

  // Strip metadata from return shape to match the expected interface
  return results.slice(0, limit).map((row) => ({
    chunk_text: row.chunk_text,
    document_title: row.document_title,
    chunk_index: row.chunk_index,
    source_type: row.source_type,
  }));
}
