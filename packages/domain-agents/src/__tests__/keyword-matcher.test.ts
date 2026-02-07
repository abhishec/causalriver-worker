/**
 * Nexus Domain Agents - Keyword Matcher Tests
 *
 * Comprehensive tests for the keyword-based intent classification system including:
 * - buildKeywordIndex: index construction, normalization, mapping
 * - tokenizeQuery: single words, bigrams, trigrams, normalization
 * - matchKeywords: scoring, confidence, cross-domain, persona mapping, config
 * - quickModuleCheck: matching and non-matching scenarios
 * - getMatchingKeywords: keyword retrieval and empty results
 */

import { describe, it, expect } from 'vitest';
import {
  buildKeywordIndex,
  tokenizeQuery,
  matchKeywords,
  quickModuleCheck,
  getMatchingKeywords,
} from '../intent/keyword-matcher';
import type { ModuleRegistry } from '../types';

// ============================================================================
// TEST REGISTRY
// ============================================================================

const testRegistry: ModuleRegistry = {
  finance: {
    id: 'finance',
    name: 'Finance',
    description: 'Financial management',
    icon: '\u{1F4B0}',
    keywords: ['invoice', 'cash flow', 'budget', 'revenue recognition'],
    capabilities: ['Invoice tracking'],
    tables: ['invoices'],
    personas: ['CFO'],
  },
  revenue: {
    id: 'revenue',
    name: 'Revenue',
    description: 'Sales pipeline',
    icon: '\u{1F4C8}',
    keywords: ['pipeline', 'deal', 'sales', 'quota', 'win rate'],
    capabilities: ['Pipeline management'],
    tables: ['deals'],
    personas: ['VP Sales'],
  },
  cs: {
    id: 'cs',
    name: 'Customer Success',
    description: 'Customer health',
    icon: '\u{1F49A}',
    keywords: ['health score', 'churn', 'NPS', 'retention'],
    capabilities: ['Health scoring'],
    tables: ['clients'],
    personas: ['CSM'],
  },
};

// ============================================================================
// buildKeywordIndex TESTS
// ============================================================================

describe('Keyword Matcher - buildKeywordIndex', () => {
  it('creates correct keywordToModules entries', () => {
    const index = buildKeywordIndex(testRegistry);

    // "invoice" should map to finance
    expect(index.keywordToModules.get('invoice')).toEqual(['finance']);

    // "pipeline" should map to revenue
    expect(index.keywordToModules.get('pipeline')).toEqual(['revenue']);

    // "churn" should map to cs
    expect(index.keywordToModules.get('churn')).toEqual(['cs']);

    // "deal" should map to revenue
    expect(index.keywordToModules.get('deal')).toEqual(['revenue']);
  });

  it('creates moduleKeywords for each module', () => {
    const index = buildKeywordIndex(testRegistry);

    expect(index.moduleKeywords.has('finance')).toBe(true);
    expect(index.moduleKeywords.has('revenue')).toBe(true);
    expect(index.moduleKeywords.has('cs')).toBe(true);

    // finance module should have its normalized keywords
    const financeKw = index.moduleKeywords.get('finance')!;
    expect(financeKw.has('invoice')).toBe(true);
    expect(financeKw.has('cash flow')).toBe(true);
    expect(financeKw.has('budget')).toBe(true);
    expect(financeKw.has('revenue recognition')).toBe(true);
  });

  it('populates allKeywords set', () => {
    const index = buildKeywordIndex(testRegistry);

    // Should contain all unique keywords across all modules
    // finance: invoice, cash flow, budget, revenue recognition
    // revenue: pipeline, deal, sales, quota, win rate
    // cs: health score, churn, nps, retention
    expect(index.allKeywords.size).toBe(13);
    expect(index.allKeywords.has('invoice')).toBe(true);
    expect(index.allKeywords.has('pipeline')).toBe(true);
    expect(index.allKeywords.has('health score')).toBe(true);
  });

  it('normalizes keywords (lowercase, strips special chars)', () => {
    const registryWithSpecialChars: ModuleRegistry = {
      test: {
        id: 'test',
        name: 'Test',
        description: 'Test module',
        icon: 'T',
        keywords: ['Invoice!!!', '  CASH  FLOW  ', 'Revenue@Recognition#'],
        capabilities: ['Test'],
        tables: ['test'],
        personas: ['Tester'],
      },
    };

    const index = buildKeywordIndex(registryWithSpecialChars);

    // "Invoice!!!" should become "invoice"
    expect(index.allKeywords.has('invoice')).toBe(true);

    // "  CASH  FLOW  " should become "cash flow" (trimmed and collapsed whitespace)
    expect(index.allKeywords.has('cash flow')).toBe(true);

    // "Revenue@Recognition#" should become "revenuerecognition" (non-alphanumeric stripped except spaces/hyphens)
    expect(index.allKeywords.has('revenuerecognition')).toBe(true);
  });
});

// ============================================================================
// tokenizeQuery TESTS
// ============================================================================

describe('Keyword Matcher - tokenizeQuery', () => {
  it('returns single words', () => {
    const tokens = tokenizeQuery('show me invoices');

    expect(tokens).toContain('show');
    expect(tokens).toContain('me');
    expect(tokens).toContain('invoices');
  });

  it('returns bigrams', () => {
    const tokens = tokenizeQuery('show me invoices');

    expect(tokens).toContain('show me');
    expect(tokens).toContain('me invoices');
  });

  it('returns trigrams', () => {
    const tokens = tokenizeQuery('show me invoices now');

    expect(tokens).toContain('show me invoices');
    expect(tokens).toContain('me invoices now');
  });

  it('normalizes and trims', () => {
    const tokens = tokenizeQuery('  CASH  Flow!!!  ');

    // Should contain lowercased, trimmed tokens
    expect(tokens).toContain('cash');
    expect(tokens).toContain('flow');
    expect(tokens).toContain('cash flow');

    // Should not contain uppercase or untrimmed entries
    const hasUppercase = tokens.some((t) => t !== t.toLowerCase());
    expect(hasUppercase).toBe(false);

    const hasLeadingTrailingSpaces = tokens.some(
      (t) => t !== t.trim(),
    );
    expect(hasLeadingTrailingSpaces).toBe(false);
  });
});

// ============================================================================
// matchKeywords TESTS
// ============================================================================

describe('Keyword Matcher - matchKeywords', () => {
  it('returns correct primaryModule for "invoice"', () => {
    const index = buildKeywordIndex(testRegistry);
    const result = matchKeywords('invoice', index, testRegistry);

    expect(result.primaryModule).toBe('finance');
    expect(result.modules).toContain('finance');
    expect(result.matchedKeywords).toContain('invoice');
  });

  it('returns finance for "cash flow" with multiWordBoost', () => {
    const index = buildKeywordIndex(testRegistry);
    const result = matchKeywords('cash flow', index, testRegistry);

    expect(result.primaryModule).toBe('finance');
    expect(result.matchedKeywords).toContain('cash flow');
    // The multi-word keyword "cash flow" should receive a boosted score
    // (exactMatchWeight * multiWordBoost = 1.0 * 1.5 = 1.5) versus
    // a single-word exact match which gets exactMatchWeight (1.0).
    // Verify the confidence is positive and the module is correctly identified.
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it('returns executive default when no match', () => {
    const index = buildKeywordIndex(testRegistry);
    const result = matchKeywords('completely unrelated query about weather', index, testRegistry);

    expect(result.primaryModule).toBe('executive');
    expect(result.confidence).toBe(0.1);
    expect(result.matchedKeywords).toHaveLength(0);
    expect(result.isCrossDomain).toBe(false);
  });

  it('detects cross-domain when query matches multiple modules', () => {
    const index = buildKeywordIndex(testRegistry);
    // "invoice" -> finance, "deal" -> revenue. Both should score and if close enough, cross-domain
    const result = matchKeywords('invoice and deal tracking', index, testRegistry);

    expect(result.isCrossDomain).toBe(true);
    expect(result.modules.length).toBeGreaterThan(1);
  });

  it('returns method: keyword', () => {
    const index = buildKeywordIndex(testRegistry);
    const result = matchKeywords('invoice', index, testRegistry);

    expect(result.method).toBe('keyword');
  });

  it('respects custom config weights', () => {
    const index = buildKeywordIndex(testRegistry);

    // With very high exactMatchWeight, confidence should be higher
    const highWeight = matchKeywords('invoice', index, testRegistry, {
      exactMatchWeight: 10.0,
    });

    // With very low exactMatchWeight, confidence should be lower
    const lowWeight = matchKeywords('invoice', index, testRegistry, {
      exactMatchWeight: 0.1,
    });

    expect(highWeight.confidence).toBeGreaterThan(lowWeight.confidence);
  });

  it('returns suggestedPersona', () => {
    const index = buildKeywordIndex(testRegistry);

    const financeResult = matchKeywords('invoice', index, testRegistry);
    expect(financeResult.suggestedPersona).toBe('cfo');

    const revenueResult = matchKeywords('pipeline', index, testRegistry);
    expect(revenueResult.suggestedPersona).toBe('vp-sales');

    const csResult = matchKeywords('churn', index, testRegistry);
    expect(csResult.suggestedPersona).toBe('vp-cs');
  });

  it('confidence is between 0 and 1', () => {
    const index = buildKeywordIndex(testRegistry);

    // Test with various queries
    const queries = [
      'invoice',
      'cash flow budget revenue recognition',
      'pipeline deal sales quota',
      'unknown query',
      'invoice deal churn',
    ];

    for (const query of queries) {
      const result = matchKeywords(query, index, testRegistry);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('with minConfidence ensures minimum threshold', () => {
    const index = buildKeywordIndex(testRegistry);

    // A query with a weak match might have low confidence,
    // but minConfidence should enforce a floor
    const result = matchKeywords('invoice', index, testRegistry, {
      minConfidence: 0.8,
    });

    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });
});

// ============================================================================
// quickModuleCheck TESTS
// ============================================================================

describe('Keyword Matcher - quickModuleCheck', () => {
  it('returns true for matching query', () => {
    const index = buildKeywordIndex(testRegistry);

    expect(quickModuleCheck('invoice', 'finance', index)).toBe(true);
    expect(quickModuleCheck('cash flow analysis', 'finance', index)).toBe(true);
    expect(quickModuleCheck('pipeline review', 'revenue', index)).toBe(true);
    expect(quickModuleCheck('churn prevention', 'cs', index)).toBe(true);
  });

  it('returns false for non-matching', () => {
    const index = buildKeywordIndex(testRegistry);

    // "invoice" should not match revenue module
    expect(quickModuleCheck('invoice', 'revenue', index)).toBe(false);

    // "pipeline" should not match finance module
    expect(quickModuleCheck('pipeline', 'finance', index)).toBe(false);

    // completely unrelated query
    expect(quickModuleCheck('weather forecast', 'finance', index)).toBe(false);
  });

  it('returns false for unknown module', () => {
    const index = buildKeywordIndex(testRegistry);

    expect(quickModuleCheck('invoice', 'nonexistent', index)).toBe(false);
    expect(quickModuleCheck('anything', 'unknown-module', index)).toBe(false);
  });
});

// ============================================================================
// getMatchingKeywords TESTS
// ============================================================================

describe('Keyword Matcher - getMatchingKeywords', () => {
  it('returns matched keywords', () => {
    const index = buildKeywordIndex(testRegistry);
    const matches = getMatchingKeywords('invoice and pipeline', index);

    // Should find "invoice" -> finance and "pipeline" -> revenue
    expect(matches.length).toBeGreaterThanOrEqual(2);

    const invoiceMatch = matches.find((m) => m.keyword === 'invoice');
    expect(invoiceMatch).toBeDefined();
    expect(invoiceMatch!.modules).toContain('finance');

    const pipelineMatch = matches.find((m) => m.keyword === 'pipeline');
    expect(pipelineMatch).toBeDefined();
    expect(pipelineMatch!.modules).toContain('revenue');
  });

  it('returns empty for unmatched query', () => {
    const index = buildKeywordIndex(testRegistry);
    const matches = getMatchingKeywords('completely unrelated topic about astronomy', index);

    expect(matches).toHaveLength(0);
  });
});
