/**
 * Code Indexing Module
 *
 * Regex-based code symbol extraction, embedding, and search.
 *
 * Usage:
 *   import { createCodeParser, createCodeEmbedder, createCodeSearch } from '@nexus-ai/memory-stack/code-indexing';
 */

export {
  createCodeParser,
  type CodeSymbol,
  type FileIndex,
  type CodeParserConfig,
} from './code-parser';

export {
  createCodeEmbedder,
  type EmbedResult,
  type BatchEmbedResult,
} from './code-embedder';

export {
  createCodeSearch,
  type CodeSearchResult,
  type CodeSearchOptions,
} from './code-search';
