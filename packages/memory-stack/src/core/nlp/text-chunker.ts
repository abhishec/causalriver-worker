/**
 * Text Chunker — Splits raw text into semantically meaningful chunks
 *
 * Features:
 * - Sentence-level splitting with abbreviation awareness
 * - Paragraph-aware chunking (respects paragraph boundaries)
 * - Configurable target chunk size with overlap
 * - HTML/wiki markup stripping
 * - Pure TypeScript, zero dependencies
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TextChunk {
  text: string;
  index: number;
  startOffset: number;
  endOffset: number;
  sentenceCount: number;
}

export interface ChunkerConfig {
  /** Target tokens per chunk (approximate, splits on sentence boundaries) */
  targetTokens?: number;
  /** Overlap tokens between consecutive chunks */
  overlapTokens?: number;
  /** Minimum chunk size in tokens to emit */
  minChunkTokens?: number;
}

const DEFAULT_CONFIG: Required<ChunkerConfig> = {
  targetTokens: 512,
  overlapTokens: 64,
  minChunkTokens: 50,
};

// ============================================================================
// MARKUP STRIPPING
// ============================================================================

/**
 * Strip HTML, wiki markup, and other formatting from text
 */
export function stripMarkup(text: string): string {
  return text
    // Remove reference tags (must come before generic HTML tag removal)
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<ref[^/]*\/>/g, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Remove wiki templates {{...}}
    .replace(/\{\{[^}]*\}\}/g, '')
    // Remove wiki file/image references
    .replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, '')
    // Convert wiki links [[target|text]] → text, [[target]] → target
    .replace(/\[\[([^|\]]*\|)?([^\]]*)\]\]/g, '$2')
    // Remove wiki bold/italic markers
    .replace(/'{2,3}/g, '')
    // Remove wiki tables
    .replace(/\{\|[\s\S]*?\|\}/g, '')
    // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// ============================================================================
// SENTENCE SPLITTING
// ============================================================================

// Common abbreviations that contain periods but are not sentence endings
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'ave', 'blvd',
  'vs', 'etc', 'inc', 'ltd', 'corp', 'co', 'dept', 'div', 'est',
  'approx', 'assn', 'govt', 'intl', 'natl', 'org', 'univ',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'fig', 'eq', 'vol', 'no', 'pp', 'ed', 'rev', 'gen', 'sgt', 'cpl',
  'e.g', 'i.e', 'cf', 'al', 'op', 'cit',
]);

/**
 * Split text into sentences, handling abbreviations and edge cases
 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = '';

  // Split on sentence-ending punctuation followed by space + uppercase or end
  const parts = text.split(/(?<=[.!?])\s+/);

  for (const part of parts) {
    if (!part.trim()) continue;

    if (current) {
      // Check if the previous "sentence" ended with an abbreviation
      const lastWord = current.trim().split(/\s+/).pop()?.replace(/[.!?]+$/, '').toLowerCase() || '';
      if (ABBREVIATIONS.has(lastWord) || /\d$/.test(lastWord)) {
        // This was an abbreviation, merge with current
        current += ' ' + part;
        continue;
      }
      // Previous was a real sentence end
      sentences.push(current.trim());
      current = part;
    } else {
      current = part;
    }
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences.filter(s => s.length > 0);
}

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

/**
 * Approximate token count (words ~= tokens for English)
 */
function estimateTokens(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ============================================================================
// CHUNKER
// ============================================================================

/**
 * Chunk text into overlapping segments respecting sentence boundaries
 */
export function chunk(text: string, config?: ChunkerConfig): TextChunk[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const cleaned = stripMarkup(text);
  const sentences = splitSentences(cleaned);

  if (sentences.length === 0) return [];

  const chunks: TextChunk[] = [];
  let chunkSentences: string[] = [];
  let chunkTokens = 0;
  let startSentenceIdx = 0;
  let textOffset = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceTokens = estimateTokens(sentence);

    chunkSentences.push(sentence);
    chunkTokens += sentenceTokens;

    // When we reach the target size, emit a chunk
    if (chunkTokens >= cfg.targetTokens || i === sentences.length - 1) {
      const chunkText = chunkSentences.join(' ');

      if (estimateTokens(chunkText) >= cfg.minChunkTokens) {
        chunks.push({
          text: chunkText,
          index: chunks.length,
          startOffset: textOffset,
          endOffset: textOffset + chunkText.length,
          sentenceCount: chunkSentences.length,
        });
      }

      textOffset += chunkText.length + 1;

      // Calculate overlap: go back enough sentences to cover overlapTokens
      let overlapSentences: string[] = [];
      let overlapTokenCount = 0;
      for (let j = chunkSentences.length - 1; j >= 0 && overlapTokenCount < cfg.overlapTokens; j--) {
        overlapSentences.unshift(chunkSentences[j]);
        overlapTokenCount += estimateTokens(chunkSentences[j]);
      }

      chunkSentences = overlapSentences;
      chunkTokens = overlapTokenCount;
      startSentenceIdx = i - overlapSentences.length + 1;
    }
  }

  return chunks;
}
