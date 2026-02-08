/**
 * Code Search — Semantic Search Across Indexed Code Symbols
 *
 * Uses the existing semantic search infrastructure to find
 * code symbols by natural language queries.
 *
 * @example
 * ```typescript
 * const codeSearch = createCodeSearch({ semanticSearch });
 * const results = await codeSearch.searchCode(supabase, 'authentication handler');
 * // [{ symbol: 'authenticate', kind: 'function', filePath: 'src/auth.ts', similarity: 0.89 }]
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding, cosineSimilarity } from '../core/embeddings/embedding-engine';

// ============================================================================
// TYPES
// ============================================================================

export interface CodeSearchResult {
  /** Symbol name */
  symbol: string;
  /** Symbol kind (function, class, interface, etc.) */
  kind: string;
  /** File path where the symbol is defined */
  filePath: string;
  /** Full signature */
  signature?: string;
  /** Start line in file */
  startLine?: number;
  /** Cosine similarity score */
  similarity: number;
  /** Parent class (for methods) */
  parentSymbol?: string;
  /** Documentation comment */
  docComment?: string;
}

export interface CodeSearchOptions {
  /** Filter by language (typescript, javascript, etc.) */
  language?: string;
  /** Filter by symbol kind */
  symbolKind?: string;
  /** Max results (default: 10) */
  limit?: number;
  /** Only return exported symbols (default: false) */
  exportedOnly?: boolean;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a code search engine.
 */
export function createCodeSearch() {
  /**
   * Semantic search across indexed code symbols
   */
  async function searchCode(
    supabase: SupabaseClient,
    query: string,
    organizationId: string,
    options: CodeSearchOptions = {}
  ): Promise<CodeSearchResult[]> {
    const { language, symbolKind, limit = 10, exportedOnly = false } = options;

    // Generate query embedding
    const queryEmbedding = generateEmbedding(query);

    // Fetch code symbol embeddings
    let dbQuery = supabase
      .from('entity_embeddings')
      .select('entity_id, content, embedding, metadata, importance_score')
      .eq('organization_id', organizationId)
      .eq('entity_type', 'code_symbol');

    const { data, error } = await dbQuery;
    if (error || !data) return [];

    // Compute similarities and filter
    const results: CodeSearchResult[] = [];

    for (const row of data) {
      const meta = row.metadata || {};

      // Apply filters
      if (language && meta.language !== language) continue;
      if (symbolKind && meta.kind !== symbolKind) continue;
      if (exportedOnly && !meta.isExported) continue;

      // Parse stored embedding
      let storedEmbedding: number[];
      try {
        storedEmbedding =
          typeof row.embedding === 'string'
            ? JSON.parse(row.embedding)
            : row.embedding;
      } catch {
        continue;
      }

      const similarity = cosineSimilarity(queryEmbedding, storedEmbedding);

      results.push({
        symbol: meta.name || row.entity_id.split('::').pop() || '',
        kind: meta.kind || 'unknown',
        filePath: meta.filePath || '',
        startLine: meta.startLine,
        similarity,
        parentSymbol: meta.parentSymbol,
        signature: row.content?.split('\n').find((l: string) => l.startsWith('Signature:'))?.replace('Signature: ', ''),
        docComment: row.content?.split('\n').find((l: string) => l.startsWith('Documentation:'))?.replace('Documentation: ', ''),
      });
    }

    // Sort by similarity and return top results
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Get formatted code context string for LLM prompt injection
   */
  async function getCodeContext(
    supabase: SupabaseClient,
    query: string,
    organizationId: string,
    limit: number = 5
  ): Promise<string> {
    const results = await searchCode(supabase, query, organizationId, { limit });

    if (results.length === 0) return '';

    const contextParts = results.map((r) => {
      const parts = [`${r.kind} ${r.symbol} (${r.filePath}:${r.startLine || '?'})`];
      if (r.signature) parts.push(`  Signature: ${r.signature}`);
      if (r.parentSymbol) parts.push(`  Class: ${r.parentSymbol}`);
      if (r.docComment) parts.push(`  Doc: ${r.docComment.substring(0, 200)}`);
      parts.push(`  Relevance: ${(r.similarity * 100).toFixed(0)}%`);
      return parts.join('\n');
    });

    return `## Relevant Code\n${contextParts.join('\n\n')}`;
  }

  return {
    searchCode,
    getCodeContext,
  };
}
