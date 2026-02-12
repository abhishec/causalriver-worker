/**
 * NLP Signal Enricher — Cross-Connector Intelligence Layer
 * ═══════════════════════════════════════════════════════════
 *
 * A unified NLP enrichment module that any connector can use to automatically
 * tag signals with sentiment, topics, and entities extracted from text fields.
 *
 * Brain Analog: The Wernicke's Area — responsible for language comprehension.
 * Just as Wernicke's area extracts meaning from raw auditory input, this module
 * extracts semantic signals from raw text data across all connectors.
 *
 * Usage:
 *   import { enrichSignalWithNLP } from '../core/nlp/signal-enricher';
 *   const enriched = enrichSignalWithNLP(signal, ['text', 'summary', 'title']);
 *
 * The enricher adds to signal.metadata:
 *   - nlp_sentiment_score: -1 to +1
 *   - nlp_sentiment_label: 'positive' | 'negative' | 'neutral'
 *   - nlp_sentiment_magnitude: 0 to 1 (confidence)
 *   - nlp_topics: string[] of extracted topic keywords
 *   - nlp_domain: inferred domain ('engineering', 'finance', etc.)
 *   - nlp_urgency: detected urgency level ('critical' | 'high' | 'normal' | 'low')
 *
 * @packageDocumentation
 */

import { analyzeSentiment, type SentimentResult } from './sentiment-analyzer';
import { extractTopics, type ExtractedTopics } from './topic-extractor';

// ============================================================================
// TYPES
// ============================================================================

export interface NLPEnrichment {
  /** Sentiment score: -1 (very negative) to +1 (very positive) */
  nlp_sentiment_score: number;
  /** Sentiment label */
  nlp_sentiment_label: 'positive' | 'negative' | 'neutral';
  /** Strength of sentiment (0 to 1) */
  nlp_sentiment_magnitude: number;
  /** Keywords that drove the sentiment */
  nlp_sentiment_keywords: string[];
  /** Extracted topic keywords */
  nlp_topics: string[];
  /** Inferred domain (if detected) */
  nlp_domain: string | null;
  /** Detected urgency level */
  nlp_urgency: 'critical' | 'high' | 'normal' | 'low';
}

export interface EnrichableSignal {
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EnrichmentConfig {
  /** Minimum text length to run NLP (default: 10 characters) */
  minTextLength?: number;
  /** Whether to extract topics (default: true) */
  extractTopicsEnabled?: boolean;
  /** Whether to detect urgency (default: true) */
  detectUrgency?: boolean;
  /** Maximum text length to process (default: 5000 characters) */
  maxTextLength?: number;
}

// ============================================================================
// URGENCY DETECTION
// ============================================================================

const CRITICAL_INDICATORS = [
  'outage', 'down', 'p0', 'p1', 'sev1', 'sev0', 'critical', 'emergency',
  'production down', 'data loss', 'security breach', 'immediately',
  'urgent', 'asap', 'broken', 'crashed', 'blocking', 'blocker',
];

const HIGH_INDICATORS = [
  'p2', 'sev2', 'important', 'high priority', 'escalat', 'degraded',
  'failing', 'regression', 'deadline', 'overdue', 'stuck',
];

const LOW_INDICATORS = [
  'nice to have', 'low priority', 'p4', 'sev4', 'someday', 'maybe',
  'minor', 'cosmetic', 'trivial', 'whenever',
];

/**
 * Detect urgency level from text content.
 */
export function detectUrgency(text: string): 'critical' | 'high' | 'normal' | 'low' {
  const lower = text.toLowerCase();

  for (const indicator of CRITICAL_INDICATORS) {
    if (lower.includes(indicator)) return 'critical';
  }

  for (const indicator of HIGH_INDICATORS) {
    if (lower.includes(indicator)) return 'high';
  }

  for (const indicator of LOW_INDICATORS) {
    if (lower.includes(indicator)) return 'low';
  }

  return 'normal';
}

// ============================================================================
// ENRICHMENT FUNCTIONS
// ============================================================================

/**
 * Extract text from signal metadata for NLP processing.
 * Concatenates text from multiple fields, preserving priority order.
 */
export function extractTextFromSignal(
  signal: EnrichableSignal,
  textFields: string[]
): string {
  const parts: string[] = [];
  const metadata = signal.metadata || {};

  for (const field of textFields) {
    const value = metadata[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      parts.push(value.trim());
    }
  }

  return parts.join('. ');
}

/**
 * Run NLP enrichment on raw text.
 * Returns NLP metadata fields to be merged into signal metadata.
 */
export function analyzeText(
  text: string,
  config: EnrichmentConfig = {}
): NLPEnrichment {
  const {
    minTextLength = 10,
    extractTopicsEnabled = true,
    detectUrgency: detectUrgencyEnabled = true,
    maxTextLength = 5000,
  } = config;

  // Default empty enrichment for texts too short
  if (text.length < minTextLength) {
    return {
      nlp_sentiment_score: 0,
      nlp_sentiment_label: 'neutral',
      nlp_sentiment_magnitude: 0,
      nlp_sentiment_keywords: [],
      nlp_topics: [],
      nlp_domain: null,
      nlp_urgency: 'normal',
    };
  }

  // Truncate if too long
  const processedText = text.length > maxTextLength
    ? text.substring(0, maxTextLength)
    : text;

  // Run sentiment analysis
  const sentiment: SentimentResult = analyzeSentiment(processedText);

  // Run topic extraction
  let topics: string[] = [];
  let domain: string | null = null;
  if (extractTopicsEnabled) {
    const topicResult: ExtractedTopics = extractTopics(processedText);
    topics = topicResult.keywords.map((k: { word: string; score: number }) => k.word);
    domain = topicResult.domains?.[0] || null;
  }

  // Detect urgency
  const urgency = detectUrgencyEnabled
    ? detectUrgency(processedText)
    : 'normal';

  return {
    nlp_sentiment_score: sentiment.score,
    nlp_sentiment_label: sentiment.label,
    nlp_sentiment_magnitude: sentiment.magnitude,
    nlp_sentiment_keywords: sentiment.keywords,
    nlp_topics: topics,
    nlp_domain: domain,
    nlp_urgency: urgency,
  };
}

/**
 * Enrich a connector signal with NLP-derived metadata.
 *
 * @param signal - The signal to enrich (mutated in place)
 * @param textFields - Metadata field names containing text to analyze
 * @param config - Optional enrichment configuration
 * @returns The enriched signal (same reference, with NLP fields added to metadata)
 *
 * @example
 * ```typescript
 * // In a Slack connector:
 * enrichSignalWithNLP(signal, ['text']);
 *
 * // In a Jira connector:
 * enrichSignalWithNLP(signal, ['summary', 'description']);
 *
 * // In a PagerDuty connector:
 * enrichSignalWithNLP(signal, ['title', 'description']);
 * ```
 */
export function enrichSignalWithNLP<T extends EnrichableSignal>(
  signal: T,
  textFields: string[],
  config: EnrichmentConfig = {}
): T {
  const text = extractTextFromSignal(signal, textFields);

  if (text.length === 0) return signal;

  const enrichment = analyzeText(text, config);

  // Merge NLP fields into signal metadata
  if (!signal.metadata) {
    signal.metadata = {};
  }

  Object.assign(signal.metadata, enrichment);

  return signal;
}

/**
 * Batch enrich multiple signals with NLP.
 * More efficient than calling enrichSignalWithNLP individually.
 */
export function enrichSignalsWithNLP<T extends EnrichableSignal>(
  signals: T[],
  textFields: string[],
  config: EnrichmentConfig = {}
): T[] {
  for (const signal of signals) {
    enrichSignalWithNLP(signal, textFields, config);
  }
  return signals;
}

// Re-export knowledge-aware signal enricher for unified import
export {
  enrichSignalWithKnowledgeGraph,
  enrichSignalsWithKnowledgeGraph,
  type KnowledgeEnrichment,
  type KnowledgeEnrichmentConfig,
} from './knowledge-signal-enricher';
