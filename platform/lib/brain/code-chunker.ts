/**
 * Code Chunker — Public API wrapper
 * ==================================
 * Re-exports the AST-aware code chunker with the canonical public interface.
 *
 * Use chunkCodeFile() for all code ingestion pipelines. It:
 *   - Detects language from file extension
 *   - Uses ts-morph for TypeScript/JavaScript (semantic boundaries)
 *   - Falls back to regex chunking for Python and unknown file types
 *   - Splits oversized chunks at method/function boundaries
 *   - Respects a 2000-char max per chunk
 *
 * This module is the single entry point for code chunking across the platform.
 * Import from here, not from ast-code-chunker directly.
 */

export type {
  CodeChunk,
  ChunkingOptions,
} from "@/lib/brain/ast-code-chunker";

export {
  chunkCodeFile,
  chunkCodeText,
  detectLanguage,
  estimateChunkImportance,
} from "@/lib/brain/ast-code-chunker";
