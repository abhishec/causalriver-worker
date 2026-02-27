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
 * - Embeddings are generated asynchronously (not blocking ingestion)
 * - Full-text search (tsvector) is used immediately
 * - When embeddings are available via voyage-3/ada-002, they enhance retrieval
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { generateEmbedding } from "@nexus-ai/memory-stack/embeddings";
import { reduceDimensions } from "@nexus-ai/memory-stack/embeddings";
import { absorbDocumentChunks } from "@/lib/brain/document-absorber";

// document_chunks.embedding is vector(1536). N-gram engine produces 384 dims.
// Pad 384 → 1536 using zero-fill via reduceDimensions (pads when input < target).
const EMBEDDING_DIMS = 1536;
const NGRAM_DIMS = 384;

/**
 * Generate a 1536-dim embedding for a chunk of text using n-gram hashing.
 * No API calls required — works fully offline.
 *
 * Returns pgvector format string: "[0.1,0.2,...]"
 */
function generateChunkEmbedding(text: string): string {
  const ngram = generateEmbedding(text, NGRAM_DIMS);
  const padded = reduceDimensions(ngram, EMBEDDING_DIMS);
  return `[${padded.join(",")}]`;
}

/**
 * Background: generate and store embeddings for a list of chunk IDs.
 * Fire-and-forget — called with void to not block the ingest response.
 */
async function generateEmbeddingsForChunks(
  supabase: SupabaseClient,
  chunkIds: string[],
  chunkTexts: string[]
): Promise<void> {
  for (let i = 0; i < chunkIds.length; i++) {
    try {
      const embeddingStr = generateChunkEmbedding(chunkTexts[i]);
      const { error } = await supabase
        .from("document_chunks")
        .update({ embedding: embeddingStr })
        .eq("id", chunkIds[i]);
      if (error) {
        logger.warn("[document-ingester] Failed to update embedding for chunk", {
          chunkId: chunkIds[i],
          error: error.message,
        });
      }
    } catch (err) {
      logger.warn("[document-ingester] Embedding generation failed for chunk", {
        chunkId: chunkIds[i],
        error: err instanceof Error ? err.message : String(err),
      });
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
 */
export async function ingestDocument(
  supabase: SupabaseClient,
  params: IngestDocumentParams
): Promise<IngestResult> {
  const chunks = chunkDocument(params.content);

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

  // Background: generate n-gram embeddings for each chunk (non-blocking).
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
  );

  return {
    chunksCreated: chunks.length,
    documentTitle: params.documentTitle ?? params.sourceUrl ?? "unknown",
    sourceType: params.sourceType,
  };
}

/**
 * Search document chunks — vector similarity first, tsvector fallback.
 *
 * Priority:
 *   1. Vector similarity search via search_document_chunks RPC (semantic)
 *   2. Full-text tsvector search (lexical fallback when embeddings missing)
 *   3. Recency fetch (when query is empty — context priming)
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

  // Non-empty query: try vector similarity search first
  try {
    const queryEmbedding = generateChunkEmbedding(query);
    const { data: vectorData, error: vectorError } = await supabase
      .rpc("search_document_chunks", {
        p_organization_id: organizationId,
        query_embedding: queryEmbedding,
        match_count: limit,
      });

    if (!vectorError && vectorData && vectorData.length > 0) {
      logger.warn("[document-ingester] searchDocumentChunks: vector search returned results", {
        count: vectorData.length,
      });
      return vectorData as Array<{ chunk_text: string; document_title: string | null; chunk_index: number; source_type: string }>;
    }

    if (vectorError) {
      logger.warn("[document-ingester] Vector search failed, falling back to tsvector", {
        error: vectorError.message,
      });
    } else {
      // Vector search succeeded but returned 0 results — embeddings may not yet exist for this org.
      // Fall through to tsvector below.
      logger.warn("[document-ingester] Vector search returned 0 results — falling back to tsvector");
    }
  } catch (embErr) {
    logger.warn("[document-ingester] Embedding generation for query failed, falling back to tsvector", {
      error: embErr instanceof Error ? embErr.message : String(embErr),
    });
  }

  // Fallback: PostgreSQL full-text search (always available — search_vector is GENERATED ALWAYS AS)
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
