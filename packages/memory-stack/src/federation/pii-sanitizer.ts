/**
 * PII Sanitizer — Anonymizes text for upstream federation
 *
 * Detects PII entities using the existing entity extractor (fast regex, zero API calls)
 * and replaces them with type-preserving placeholders. Non-PII entities that carry
 * universal knowledge value (technologies, metrics, percentages) are preserved.
 *
 * Used by the upstream promoter to ensure no org-specific PII flows to the core brain.
 */

import { createEntityExtractor, type ExtractedEntity } from '../core/entity-extraction';

// ============================================================================
// TYPES
// ============================================================================

export interface SanitizationResult {
  sanitizedText: string;
  entitiesRedacted: number;
  redactionReport: { type: string; count: number }[];
}

export interface PIISanitizerConfig {
  /** Generalize amounts to range buckets (default: true) */
  preserveAmountRanges?: boolean;
  /** Generalize dates to quarters (default: true) */
  preserveDateQuarters?: boolean;
  /** Additional regex patterns to redact */
  customRedactPatterns?: RegExp[];
}

// PII entity types that must be redacted
const PII_TYPES = new Set(['person', 'company', 'email', 'url', 'mention']);

// Entity types that are safe to keep (universal knowledge)
const SAFE_TYPES = new Set(['technology', 'metric', 'percentage']);

// ============================================================================
// AMOUNT BUCKETING
// ============================================================================

function bucketAmount(value: number): string {
  if (value < 1000) return 'under $1K';
  if (value < 10000) return '$1K-$10K range';
  if (value < 100000) return '$10K-$100K range';
  if (value < 1000000) return '$100K-$1M range';
  if (value < 10000000) return '$1M-$10M range';
  if (value < 100000000) return '$10M-$100M range';
  return 'over $100M';
}

// ============================================================================
// DATE GENERALIZATION
// ============================================================================

function generalizeDate(dateText: string): string {
  const parsed = new Date(dateText);
  if (isNaN(parsed.getTime())) return '[DATE]';
  const month = parsed.getMonth(); // 0-11
  const quarter = Math.floor(month / 3) + 1;
  return `Q${quarter} ${parsed.getFullYear()}`;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPIISanitizer(config?: PIISanitizerConfig) {
  const extractor = createEntityExtractor({ minConfidence: 0.5 });
  const preserveAmountRanges = config?.preserveAmountRanges ?? true;
  const preserveDateQuarters = config?.preserveDateQuarters ?? true;

  /**
   * Sanitize a text string by replacing PII with placeholders.
   */
  function sanitizeText(text: string): SanitizationResult {
    if (!text || text.trim().length === 0) {
      return { sanitizedText: text, entitiesRedacted: 0, redactionReport: [] };
    }

    const entities = extractor.extractFromText(text);
    if (entities.length === 0 && (!config?.customRedactPatterns || config.customRedactPatterns.length === 0)) {
      return { sanitizedText: text, entitiesRedacted: 0, redactionReport: [] };
    }

    // Track redaction counts by type
    const redactionCounts = new Map<string, number>();

    // Sort entities by startOffset descending so we can replace from end to start
    // without invalidating earlier offsets
    const sortedEntities = [...entities].sort((a, b) => b.startOffset - a.startOffset);

    let result = text;

    for (const entity of sortedEntities) {
      if (SAFE_TYPES.has(entity.type)) {
        continue; // Keep technologies, metrics, percentages as-is
      }

      let replacement: string;

      if (PII_TYPES.has(entity.type)) {
        // Redact PII with type-preserving placeholder
        const count = (redactionCounts.get(entity.type) || 0) + 1;
        redactionCounts.set(entity.type, count);
        replacement = `[${entity.type.toUpperCase()}]`;
      } else if (entity.type === 'amount') {
        if (preserveAmountRanges && typeof entity.normalizedValue === 'number') {
          replacement = bucketAmount(entity.normalizedValue);
        } else {
          redactionCounts.set('amount', (redactionCounts.get('amount') || 0) + 1);
          replacement = '[AMOUNT]';
        }
      } else if (entity.type === 'date') {
        if (preserveDateQuarters) {
          replacement = generalizeDate(entity.text);
        } else {
          redactionCounts.set('date', (redactionCounts.get('date') || 0) + 1);
          replacement = '[DATE]';
        }
      } else {
        // Unknown type — redact to be safe
        redactionCounts.set(entity.type, (redactionCounts.get(entity.type) || 0) + 1);
        replacement = `[${entity.type.toUpperCase()}]`;
      }

      result =
        result.substring(0, entity.startOffset) +
        replacement +
        result.substring(entity.endOffset);
    }

    // Apply custom redact patterns
    if (config?.customRedactPatterns) {
      for (const pattern of config.customRedactPatterns) {
        const matches = result.match(pattern);
        if (matches) {
          redactionCounts.set('custom', (redactionCounts.get('custom') || 0) + matches.length);
          result = result.replace(pattern, '[REDACTED]');
        }
      }
    }

    const totalRedacted = Array.from(redactionCounts.values()).reduce((a, b) => a + b, 0);
    const report = Array.from(redactionCounts.entries()).map(([type, count]) => ({ type, count }));

    return {
      sanitizedText: result,
      entitiesRedacted: totalRedacted,
      redactionReport: report,
    };
  }

  /**
   * Check if text has too much PII to be safely shared (>50% redacted).
   */
  function isTooRisky(text: string): boolean {
    if (!text || text.trim().length === 0) return false;
    const result = sanitizeText(text);
    // If more than half the original text length was replaced, it's too PII-heavy
    const originalLen = text.length;
    const sanitizedLen = result.sanitizedText.length;
    // Rough heuristic: if many entities were redacted relative to text length
    return result.entitiesRedacted > 0 && (result.entitiesRedacted / Math.max(text.split(/\s+/).length, 1)) > 0.5;
  }

  /**
   * Sanitize a causal relationship record for upstream promotion.
   */
  function sanitizeRelationship(rel: any): { sanitized: any; report: SanitizationResult | null; skip: boolean } {
    const sanitized = { ...rel };

    // Strip org-identifying fields
    delete sanitized.organization_id;
    delete sanitized.id;
    delete sanitized._source;

    // Sanitize natural language description
    let report: SanitizationResult | null = null;
    if (sanitized.natural_language) {
      if (isTooRisky(sanitized.natural_language)) {
        return { sanitized, report: null, skip: true };
      }
      report = sanitizeText(sanitized.natural_language);
      sanitized.natural_language = report.sanitizedText;
    }

    // Domain names are generally safe (generic categories like "finance", "engineering")
    // but sanitize if they contain entity-specific info
    if (sanitized.metadata) {
      const metaStr = JSON.stringify(sanitized.metadata);
      const metaResult = sanitizeText(metaStr);
      if (metaResult.entitiesRedacted > 0) {
        sanitized.metadata = JSON.parse(metaResult.sanitizedText);
      }
    }

    return { sanitized, report, skip: false };
  }

  /**
   * Sanitize a memory record for upstream promotion.
   */
  function sanitizeMemory(mem: any): { sanitized: any; report: SanitizationResult | null; skip: boolean } {
    const sanitized = { ...mem };

    // Strip org-identifying fields
    delete sanitized.organization_id;
    delete sanitized.id;
    delete sanitized._source;

    // Sanitize content
    if (sanitized.content) {
      if (isTooRisky(sanitized.content)) {
        return { sanitized, report: null, skip: true };
      }
      const report = sanitizeText(sanitized.content);
      sanitized.content = report.sanitizedText;
      return { sanitized, report, skip: false };
    }

    // Sanitize metadata
    if (sanitized.metadata) {
      const metaStr = JSON.stringify(sanitized.metadata);
      const metaResult = sanitizeText(metaStr);
      if (metaResult.entitiesRedacted > 0) {
        sanitized.metadata = JSON.parse(metaResult.sanitizedText);
      }
    }

    return { sanitized, report: null, skip: false };
  }

  /**
   * Sanitize a brain grammar rule for upstream promotion.
   */
  function sanitizeRule(rule: any): { sanitized: any; report: SanitizationResult | null; skip: boolean } {
    const sanitized = { ...rule };

    // Strip org-identifying fields
    delete sanitized.organization_id;
    delete sanitized.id;
    delete sanitized._source;

    // Sanitize natural language
    if (sanitized.natural_language) {
      if (isTooRisky(sanitized.natural_language)) {
        return { sanitized, report: null, skip: true };
      }
      const report = sanitizeText(sanitized.natural_language);
      sanitized.natural_language = report.sanitizedText;
      return { sanitized, report, skip: false };
    }

    // Sanitize conditions/actions metadata
    if (sanitized.conditions) {
      const condStr = JSON.stringify(sanitized.conditions);
      const condResult = sanitizeText(condStr);
      if (condResult.entitiesRedacted > 0) {
        sanitized.conditions = JSON.parse(condResult.sanitizedText);
      }
    }

    if (sanitized.actions) {
      const actStr = JSON.stringify(sanitized.actions);
      const actResult = sanitizeText(actStr);
      if (actResult.entitiesRedacted > 0) {
        sanitized.actions = JSON.parse(actResult.sanitizedText);
      }
    }

    return { sanitized, report: null, skip: false };
  }

  return {
    sanitizeText,
    isTooRisky,
    sanitizeRelationship,
    sanitizeMemory,
    sanitizeRule,
  };
}
