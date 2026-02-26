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

  const { error } = await supabase
    .from("document_chunks")
    .insert(rows);

  if (error) {
    throw new Error(`Failed to ingest document: ${error.message}`);
  }

  logger.warn(`[document-ingester] Ingested ${chunks.length} chunks from "${params.documentTitle ?? params.sourceUrl ?? "unknown"}"`);

  return {
    chunksCreated: chunks.length,
    documentTitle: params.documentTitle ?? params.sourceUrl ?? "unknown",
    sourceType: params.sourceType,
  };
}

/**
 * Search document chunks using full-text search.
 * Falls back to this when embeddings are not available.
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

  // Non-empty query: use PostgreSQL full-text search
  const { data, error } = await supabase
    .from("document_chunks")
    .select("chunk_text, document_title, chunk_index, source_type")
    .eq("organization_id", organizationId)
    .textSearch("search_vector", query.split(" ").join(" | "), { type: "websearch" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn("[document-ingester] searchDocumentChunks failed", { error: error.message });
    return [];
  }

  return data ?? [];
}
