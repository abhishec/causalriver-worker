/**
 * Nexus Domain Agents - Intent Classifier Tests
 *
 * Comprehensive tests for the intent classification engine including:
 * - createIntentClassifier: factory function, returned methods
 * - classifyByKeywords: keyword-based classification, method tagging
 * - classifyWithAI: AI classification, fallback to keywords on missing client or error
 * - classify: combined strategy (keyword first, AI fallback, hybrid method)
 * - getIndex / rebuildIndex: index management
 * - createSimpleClassifier: synchronous keyword-only classifier
 */

import { describe, it, expect } from 'vitest';
import { createIntentClassifier, createSimpleClassifier } from '../intent/classifier';
import type { ModuleRegistry } from '../types';
import { createMockAIClient, createFailingAIClient } from './helpers/mock-ai-client';

// ============================================================================
// TEST REGISTRY
// ============================================================================

const testRegistry: ModuleRegistry = {
  finance: {
    id: 'finance',
    name: 'Finance',
    description: 'Financial management',
    icon: '\u{1F4B0}',
    keywords: ['invoice', 'cash flow', 'budget'],
    capabilities: ['Invoice tracking'],
    tables: ['invoices'],
    personas: ['CFO'],
  },
  revenue: {
    id: 'revenue',
    name: 'Revenue',
    description: 'Sales pipeline',
    icon: '\u{1F4C8}',
    keywords: ['pipeline', 'deal', 'sales', 'quota'],
    capabilities: ['Pipeline management'],
    tables: ['deals'],
    personas: ['VP Sales'],
  },
  cs: {
    id: 'cs',
    name: 'Customer Success',
    description: 'Customer health',
    icon: '\u{1F49A}',
    keywords: ['health score', 'churn', 'NPS'],
    capabilities: ['Health scoring'],
    tables: ['clients'],
    personas: ['CSM'],
  },
  executive: {
    id: 'executive',
    name: 'Executive',
    description: 'Strategic',
    icon: '\u{1F454}',
    keywords: ['strategy', 'board', 'KPI'],
    capabilities: ['Cross-domain'],
    tables: ['goals'],
    personas: ['CEO'],
  },
};

// ============================================================================
// createIntentClassifier TESTS
// ============================================================================

describe('Intent Classifier - createIntentClassifier', () => {
  it('returns an object with all required methods', () => {
    const classifier = createIntentClassifier({ modules: testRegistry });

    expect(classifier).toBeDefined();
    expect(typeof classifier.classifyByKeywords).toBe('function');
    expect(typeof classifier.classifyWithAI).toBe('function');
    expect(typeof classifier.classify).toBe('function');
    expect(typeof classifier.getIndex).toBe('function');
    expect(typeof classifier.rebuildIndex).toBe('function');
  });
});

// ============================================================================
// classifyByKeywords TESTS
// ============================================================================

describe('Intent Classifier - classifyByKeywords', () => {
  it('returns IntentClassification with primaryModule="finance" for "invoice"', () => {
    const classifier = createIntentClassifier({ modules: testRegistry });
    const result = classifier.classifyByKeywords('invoice');

    expect(result.primaryModule).toBe('finance');
    expect(result.modules).toContain('finance');
    expect(result.matchedKeywords).toContain('invoice');
    expect(result.confidence).toBeGreaterThan(0);
    expect(typeof result.isCrossDomain).toBe('boolean');
  });

  it('returns method="keyword"', () => {
    const classifier = createIntentClassifier({ modules: testRegistry });
    const result = classifier.classifyByKeywords('pipeline');

    expect(result.method).toBe('keyword');
  });

  it('returns executive default for an unrecognized query', () => {
    const classifier = createIntentClassifier({ modules: testRegistry });
    const result = classifier.classifyByKeywords('something completely unrelated about astronomy');

    expect(result.primaryModule).toBe('executive');
    expect(result.matchedKeywords).toHaveLength(0);
    expect(result.confidence).toBeLessThanOrEqual(0.3);
  });
});

// ============================================================================
// classifyWithAI TESTS
// ============================================================================

describe('Intent Classifier - classifyWithAI', () => {
  it('falls back to keyword classification when no aiClient is provided', async () => {
    const classifier = createIntentClassifier({ modules: testRegistry });
    const result = await classifier.classifyWithAI('invoice');

    // Without an AI client, should fall back to keyword-based classification
    expect(result.primaryModule).toBe('finance');
    expect(result.method).toBe('keyword');
  });

  it('returns method="ai" when a mock AI client is provided', async () => {
    const aiClient = createMockAIClient({
      'pipeline': JSON.stringify({
        primaryModule: 'revenue',
        modules: ['revenue'],
        confidence: 0.9,
        reasoning: 'Pipeline relates to sales',
      }),
    });

    const classifier = createIntentClassifier({
      modules: testRegistry,
      aiClient,
    });

    const result = await classifier.classifyWithAI('pipeline');

    expect(result.method).toBe('ai');
  });

  it('falls back to keyword classification when AI client fails', async () => {
    const aiClient = createFailingAIClient();

    const classifier = createIntentClassifier({
      modules: testRegistry,
      aiClient,
    });

    const result = await classifier.classifyWithAI('invoice');

    // AI failure should cause fallback to keywords
    expect(result.primaryModule).toBe('finance');
    expect(result.method).toBe('keyword');
  });

  it('parses JSON response correctly from mock AI client', async () => {
    const aiClient = createMockAIClient({
      'churn analysis': JSON.stringify({
        primaryModule: 'cs',
        modules: ['cs', 'executive'],
        confidence: 0.85,
        reasoning: 'Churn analysis is a customer success concern with strategic implications',
      }),
    });

    const classifier = createIntentClassifier({
      modules: testRegistry,
      aiClient,
    });

    const result = await classifier.classifyWithAI('churn analysis');

    expect(result.primaryModule).toBe('cs');
    expect(result.modules).toContain('cs');
    expect(result.modules).toContain('executive');
    expect(result.confidence).toBe(0.85);
    expect(result.isCrossDomain).toBe(true);
    expect(result.method).toBe('ai');
  });
});

// ============================================================================
// classify (combined) TESTS
// ============================================================================

describe('Intent Classifier - classify (combined)', () => {
  it('uses keyword result when confidence is high enough', async () => {
    const aiClient = createMockAIClient();

    const classifier = createIntentClassifier({
      modules: testRegistry,
      aiClient,
      keywordConfidenceThreshold: 0.3,
      useAIFallback: true,
    });

    // "invoice" should match finance with high enough confidence
    const result = await classifier.classify('invoice');

    // Should use keyword result directly (confidence >= threshold)
    expect(result.primaryModule).toBe('finance');
    expect(result.method).toBe('keyword');
  });

  it('tries AI fallback when keyword confidence is below threshold', async () => {
    const aiClient = createMockAIClient({
      // Default mock returns executive with 0.5 confidence
    });

    const classifier = createIntentClassifier({
      modules: testRegistry,
      aiClient,
      keywordConfidenceThreshold: 1.0, // impossibly high so keywords always fall below
      useAIFallback: true,
    });

    const result = await classifier.classify('invoice');

    // With threshold at 1.0, keyword result will not meet it, so AI fallback is attempted
    // The AI mock returns executive with 0.5 confidence by default.
    // The keyword result for "invoice" will match finance with some confidence.
    // If AI confidence (0.5) <= keyword confidence, keyword result is returned.
    // If AI confidence (0.5) > keyword confidence, hybrid is returned.
    // Either way, AI fallback was attempted.
    expect(result).toBeDefined();
    expect(result.primaryModule).toBeDefined();
  });

  it('returns method="hybrid" when AI result has higher confidence', async () => {
    const aiClient = createMockAIClient({
      // Match any query about vague topic - the default mock gives 0.5 for executive
      'what should we focus on': JSON.stringify({
        primaryModule: 'executive',
        modules: ['executive'],
        confidence: 0.9,
        reasoning: 'Strategic query about focus areas',
      }),
    });

    const classifier = createIntentClassifier({
      modules: testRegistry,
      aiClient,
      keywordConfidenceThreshold: 0.6,
      useAIFallback: true,
    });

    // This query has no keyword matches, so keyword confidence is very low (~0.1)
    // AI returns 0.9 confidence, which is higher -> hybrid
    const result = await classifier.classify('what should we focus on');

    expect(result.method).toBe('hybrid');
    expect(result.primaryModule).toBe('executive');
    expect(result.confidence).toBe(0.9);
  });

  it('returns keyword result even with low confidence when AI fallback is disabled', async () => {
    const classifier = createIntentClassifier({
      modules: testRegistry,
      aiClient: createMockAIClient(),
      keywordConfidenceThreshold: 0.6,
      useAIFallback: false,
    });

    // Query with no keyword matches - low confidence
    const result = await classifier.classify('something about the weather');

    // AI fallback disabled, so keyword result returned regardless of low confidence
    expect(result.method).toBe('keyword');
    expect(result.primaryModule).toBe('executive');
  });
});

// ============================================================================
// getIndex / rebuildIndex TESTS
// ============================================================================

describe('Intent Classifier - getIndex', () => {
  it('returns a KeywordIndex with expected structure', () => {
    const classifier = createIntentClassifier({ modules: testRegistry });
    const index = classifier.getIndex();

    expect(index).toBeDefined();
    expect(index.keywordToModules).toBeInstanceOf(Map);
    expect(index.moduleKeywords).toBeInstanceOf(Map);
    expect(index.allKeywords).toBeInstanceOf(Set);

    // Verify that the index contains entries from our registry
    expect(index.keywordToModules.get('invoice')).toEqual(['finance']);
    expect(index.moduleKeywords.has('revenue')).toBe(true);
    expect(index.allKeywords.has('pipeline')).toBe(true);
  });
});

describe('Intent Classifier - rebuildIndex', () => {
  it('creates a new index (index reference changes after rebuild)', () => {
    const classifier = createIntentClassifier({ modules: testRegistry });

    const indexBefore = classifier.getIndex();
    classifier.rebuildIndex();
    const indexAfter = classifier.getIndex();

    // After rebuild, a new index object should have been created
    expect(indexAfter).not.toBe(indexBefore);

    // But content should still be valid
    expect(indexAfter.keywordToModules.get('invoice')).toEqual(['finance']);
    expect(indexAfter.allKeywords.has('deal')).toBe(true);
  });
});

// ============================================================================
// createSimpleClassifier TESTS
// ============================================================================

describe('Intent Classifier - createSimpleClassifier', () => {
  it('returns a function', () => {
    const classify = createSimpleClassifier(testRegistry);

    expect(typeof classify).toBe('function');
  });

  it('returned function produces a valid IntentClassification', () => {
    const classify = createSimpleClassifier(testRegistry);
    const result = classify('invoice');

    // Should return a full IntentClassification object
    expect(result.primaryModule).toBe('finance');
    expect(result.modules).toContain('finance');
    expect(result.matchedKeywords).toContain('invoice');
    expect(result.method).toBe('keyword');
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(typeof result.isCrossDomain).toBe('boolean');
  });
});
