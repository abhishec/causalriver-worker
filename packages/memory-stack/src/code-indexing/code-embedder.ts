/**
 * Code Embedder — Embed Code Symbols into Vector Database
 *
 * Takes parsed FileIndex from code-parser and embeds each symbol
 * into the entity_embeddings table via the embedding engine.
 *
 * Entity type: 'code_symbol'
 * Content format: signature + docComment + bodyPreview
 *
 * @example
 * ```typescript
 * const embedder = createCodeEmbedder({ embeddingEngine });
 * const result = await embedder.embedFileSymbols(supabase, fileIndex, 'org_123');
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FileIndex, CodeSymbol } from './code-parser';
import { generateEmbedding, hashContent } from '../core/embeddings/embedding-engine';

// ============================================================================
// TYPES
// ============================================================================

export interface EmbedResult {
  symbolsEmbedded: number;
  errors: string[];
}

export interface BatchEmbedResult {
  filesProcessed: number;
  symbolsEmbedded: number;
  errors: string[];
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a code embedder that stores symbol embeddings.
 */
export function createCodeEmbedder() {
  /**
   * Format a code symbol into embeddable text
   */
  function formatSymbolForEmbedding(symbol: CodeSymbol): string {
    const parts: string[] = [];

    // Add kind and name
    parts.push(`${symbol.kind}: ${symbol.name}`);

    // Add file path context
    parts.push(`File: ${symbol.filePath}`);

    // Add parent if method
    if (symbol.parentSymbol) {
      parts.push(`Class: ${symbol.parentSymbol}`);
    }

    // Add signature
    if (symbol.signature) {
      parts.push(`Signature: ${symbol.signature}`);
    }

    // Add doc comment (cleaned)
    if (symbol.docComment) {
      const cleanDoc = symbol.docComment
        .replace(/\/\*\*|\*\/|\*/g, '')
        .replace(/@\w+/g, '')
        .trim();
      if (cleanDoc) {
        parts.push(`Documentation: ${cleanDoc}`);
      }
    }

    // Add body preview
    if (symbol.bodyPreview) {
      parts.push(`Body: ${symbol.bodyPreview.substring(0, 300)}`);
    }

    return parts.join('\n');
  }

  /**
   * Embed all symbols from a parsed file
   */
  async function embedFileSymbols(
    supabase: SupabaseClient,
    fileIndex: FileIndex,
    organizationId: string
  ): Promise<EmbedResult> {
    let symbolsEmbedded = 0;
    const errors: string[] = [];

    for (const symbol of fileIndex.symbols) {
      try {
        const contentText = formatSymbolForEmbedding(symbol);
        const contentHashVal = hashContent(contentText);
        const embedding = generateEmbedding(contentText);

        const entityId = symbol.parentSymbol
          ? `${fileIndex.filePath}::${symbol.parentSymbol}.${symbol.name}`
          : `${fileIndex.filePath}::${symbol.name}`;

        await supabase.from('entity_embeddings').upsert(
          {
            organization_id: organizationId,
            entity_type: 'code_symbol',
            entity_id: entityId,
            content: contentText,
            content_hash: contentHashVal,
            embedding: JSON.stringify(embedding),
            metadata: {
              kind: symbol.kind,
              filePath: symbol.filePath,
              name: symbol.name,
              parentSymbol: symbol.parentSymbol,
              startLine: symbol.startLine,
              endLine: symbol.endLine,
              isExported: symbol.isExported,
              language: fileIndex.language,
            },
            importance_score: symbol.isExported ? 0.8 : 0.5,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,entity_type,entity_id' }
        );

        symbolsEmbedded++;
      } catch (err: any) {
        errors.push(`${symbol.name}: ${err.message}`);
      }
    }

    return { symbolsEmbedded, errors };
  }

  /**
   * Embed all symbols from a batch of parsed file indexes
   */
  async function embedBatch(
    supabase: SupabaseClient,
    fileIndexes: FileIndex[],
    organizationId: string
  ): Promise<BatchEmbedResult> {
    let totalSymbols = 0;
    const allErrors: string[] = [];
    let filesProcessed = 0;

    for (const fileIndex of fileIndexes) {
      const result = await embedFileSymbols(supabase, fileIndex, organizationId);
      totalSymbols += result.symbolsEmbedded;
      allErrors.push(...result.errors);
      filesProcessed++;
    }

    return {
      filesProcessed,
      symbolsEmbedded: totalSymbols,
      errors: allErrors,
    };
  }

  return {
    embedFileSymbols,
    embedBatch,
    formatSymbolForEmbedding,
  };
}
