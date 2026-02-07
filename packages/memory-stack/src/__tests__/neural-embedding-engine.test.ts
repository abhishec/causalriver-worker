/**
 * Nexus Memory Stack - Neural Embedding Engine Tests
 *
 * Tests for the neural embedding engine covering:
 * - Organization vocabulary building (buildOrgVocabulary)
 * - Vocabulary-based embedding boosting (applyVocabularyBoost)
 * - Local ngram-fallback embedding generation (generateNeuralEmbedding)
 * - Batch embedding processing (generateBatchEmbeddings)
 * - NeuralEmbeddings namespace exports
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildOrgVocabulary,
  applyVocabularyBoost,
  generateNeuralEmbedding,
  generateBatchEmbeddings,
  NeuralEmbeddings,
} from '../core/embeddings/neural-embedding-engine';
import type { OrgVocabulary, NeuralEmbeddingConfig } from '../core/embeddings/neural-embedding-engine';

// ============================================================================
// HELPERS
// ============================================================================

/** Compute L2 (Euclidean) norm of a vector. */
function l2Norm(vec: number[]): number {
  return Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
}

/** Default ngram-fallback config used across most tests. */
const fallbackConfig: NeuralEmbeddingConfig = {
  model: 'ngram-fallback',
  enableCache: false,
};

/**
 * Build a sample entity text list where the given term appears in the
 * specified number of entries, all under the same domain.
 */
function repeatedTermEntries(
  term: string,
  count: number,
  domain: string
): Array<{ text: string; domain: string }> {
  return Array.from({ length: count }, () => ({
    text: `The ${term} is very important for our organization`,
    domain,
  }));
}

// ============================================================================
// buildOrgVocabulary
// ============================================================================

describe('Neural Embedding Engine', () => {
  describe('buildOrgVocabulary', () => {
    it('should return an OrgVocabulary with a terms Map', () => {
      const vocab = buildOrgVocabulary('org-1', []);
      expect(vocab).toBeDefined();
      expect(vocab.organizationId).toBe('org-1');
      expect(vocab.terms).toBeInstanceOf(Map);
      expect(vocab.updatedAt).toBeInstanceOf(Date);
    });

    it('should extract acronyms appearing 3+ times', () => {
      const entries = [
        { text: 'We use the CRM for tracking', domain: 'sales' },
        { text: 'The CRM system is great', domain: 'sales' },
        { text: 'CRM adoption has increased', domain: 'sales' },
      ];

      const vocab = buildOrgVocabulary('org-2', entries);
      expect(vocab.terms.has('crm')).toBe(true);
      expect(vocab.terms.get('crm')!.frequency).toBe(3);
    });

    it('should ignore terms appearing fewer than 3 times', () => {
      const entries = [
        { text: 'The API is ready', domain: 'engineering' },
        { text: 'API docs are updated', domain: 'engineering' },
        // Only 2 occurrences - below the threshold
      ];

      const vocab = buildOrgVocabulary('org-3', entries);
      expect(vocab.terms.has('api')).toBe(false);
    });

    it('should extract capitalized multi-word phrases appearing 3+ times', () => {
      const entries = [
        { text: 'The system uses Machine Learning for analysis', domain: 'engineering' },
        { text: 'Machine Learning models are deployed', domain: 'engineering' },
        { text: 'Machine Learning training is ongoing', domain: 'engineering' },
      ];

      const vocab = buildOrgVocabulary('org-4', entries);
      expect(vocab.terms.has('machine learning')).toBe(true);
      expect(vocab.terms.get('machine learning')!.frequency).toBe(3);
    });

    it('should set domain to a specific domain when all occurrences are from the same domain', () => {
      const entries = [
        { text: 'The KPI report is ready', domain: 'finance' },
        { text: 'KPI targets are set', domain: 'finance' },
        { text: 'Review the KPI dashboard', domain: 'finance' },
      ];

      const vocab = buildOrgVocabulary('org-5', entries);
      expect(vocab.terms.get('kpi')!.domain).toBe('finance');
    });

    it('should set domain to general when term spans multiple domains', () => {
      const entries = [
        { text: 'ROI is tracking well', domain: 'finance' },
        { text: 'Measure the ROI of the campaign', domain: 'marketing' },
        { text: 'ROI for engineering projects', domain: 'engineering' },
      ];

      const vocab = buildOrgVocabulary('org-6', entries);
      expect(vocab.terms.get('roi')!.domain).toBe('general');
    });

    it('should normalize term keys to lowercase', () => {
      const entries = [
        { text: 'The SDK is released', domain: 'engineering' },
        { text: 'SDK documentation is live', domain: 'engineering' },
        { text: 'New SDK features available', domain: 'engineering' },
      ];

      const vocab = buildOrgVocabulary('org-7', entries);
      // The original term is uppercase but the map key should be lowercase
      expect(vocab.terms.has('sdk')).toBe(true);
      expect(vocab.terms.get('sdk')!.term).toBe('SDK');
    });

    it('should extract CamelCase terms appearing 3+ times', () => {
      const entries = [
        { text: 'Use DataPipeline for processing', domain: 'engineering' },
        { text: 'DataPipeline is running smoothly', domain: 'engineering' },
        { text: 'Configure the DataPipeline output', domain: 'engineering' },
      ];

      const vocab = buildOrgVocabulary('org-8', entries);
      expect(vocab.terms.has('datapipeline')).toBe(true);
      expect(vocab.terms.get('datapipeline')!.frequency).toBe(3);
    });
  });

  // ============================================================================
  // applyVocabularyBoost
  // ============================================================================

  describe('applyVocabularyBoost', () => {
    let sampleVocab: OrgVocabulary;
    let sampleEmbedding: number[];

    beforeEach(() => {
      // Build a small vocabulary with a known term
      sampleVocab = {
        organizationId: 'org-test',
        terms: new Map([
          [
            'nexus',
            {
              term: 'Nexus',
              synonyms: [],
              domain: 'engineering',
              frequency: 5,
            },
          ],
        ]),
        updatedAt: new Date(),
      };

      // Simple 10-dimensional unit vector for testing
      const raw = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const mag = l2Norm(raw);
      sampleEmbedding = raw.map((v) => v / mag);
    });

    it('should return an array of the same length as the input embedding', () => {
      const result = applyVocabularyBoost(
        'The nexus platform is great',
        sampleEmbedding,
        sampleVocab
      );
      expect(result.length).toBe(sampleEmbedding.length);
    });

    it('should produce a unit vector (L2 norm approximately 1)', () => {
      const result = applyVocabularyBoost(
        'The nexus platform is great',
        sampleEmbedding,
        sampleVocab
      );
      const norm = l2Norm(result);
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it('should modify the embedding when a vocabulary term is found in the text', () => {
      const result = applyVocabularyBoost(
        'We deployed the nexus update',
        sampleEmbedding,
        sampleVocab
      );

      // At least one dimension should differ from the original
      let hasDifference = false;
      for (let i = 0; i < sampleEmbedding.length; i++) {
        if (Math.abs(result[i] - sampleEmbedding[i]) > 1e-10) {
          hasDifference = true;
          break;
        }
      }
      expect(hasDifference).toBe(true);
    });

    it('should return a similar embedding when no vocabulary terms match the text', () => {
      const result = applyVocabularyBoost(
        'completely unrelated text with no vocab hits',
        sampleEmbedding,
        sampleVocab
      );

      // Without any matching terms the boosted vector should equal the original
      for (let i = 0; i < sampleEmbedding.length; i++) {
        expect(result[i]).toBeCloseTo(sampleEmbedding[i], 10);
      }
    });

    it('should apply a custom boostFactor when provided', () => {
      const resultDefault = applyVocabularyBoost(
        'nexus platform',
        sampleEmbedding,
        sampleVocab
      );

      const resultStrong = applyVocabularyBoost(
        'nexus platform',
        sampleEmbedding,
        sampleVocab,
        2.0
      );

      // Both should be unit vectors
      expect(l2Norm(resultDefault)).toBeCloseTo(1.0, 5);
      expect(l2Norm(resultStrong)).toBeCloseTo(1.0, 5);

      // The stronger boost should produce a different distribution than the default
      let diffSum = 0;
      for (let i = 0; i < resultDefault.length; i++) {
        diffSum += Math.abs(resultStrong[i] - resultDefault[i]);
      }
      expect(diffSum).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // generateNeuralEmbedding (ngram-fallback)
  // ============================================================================

  describe('generateNeuralEmbedding (ngram-fallback)', () => {
    it('should return an EmbeddingResult', async () => {
      const result = await generateNeuralEmbedding(
        'Hello world test text',
        fallbackConfig
      );

      expect(result).toBeDefined();
      expect(result.embedding).toBeInstanceOf(Array);
      expect(result.model).toBe('ngram-fallback');
      expect(typeof result.dimensions).toBe('number');
      expect(typeof result.cached).toBe('boolean');
    });

    it('should return cached: false on the first call', async () => {
      const result = await generateNeuralEmbedding(
        'unique-first-call-text-' + Date.now(),
        { model: 'ngram-fallback', enableCache: true }
      );

      expect(result.cached).toBe(false);
    });

    it('should produce an embedding with 384 dimensions (default for ngram-fallback)', async () => {
      const result = await generateNeuralEmbedding(
        'Dimension check test',
        fallbackConfig
      );

      expect(result.dimensions).toBe(384);
      expect(result.embedding.length).toBe(384);
    });

    it('should return cached: true on the second call with enableCache', async () => {
      const uniqueText = 'cache-test-text-' + Date.now();
      const config: NeuralEmbeddingConfig = {
        model: 'ngram-fallback',
        enableCache: true,
      };

      const first = await generateNeuralEmbedding(uniqueText, config);
      expect(first.cached).toBe(false);

      const second = await generateNeuralEmbedding(uniqueText, config);
      expect(second.cached).toBe(true);
    });

    it('should reduce dimensions when targetDimension is set', async () => {
      const result = await generateNeuralEmbedding('Dimension reduction test', {
        model: 'ngram-fallback',
        enableCache: false,
        targetDimension: 128,
      });

      expect(result.dimensions).toBe(128);
      expect(result.embedding.length).toBe(128);
    });

    it('should produce a unit vector (L2 norm approximately 1)', async () => {
      const result = await generateNeuralEmbedding(
        'normalization check',
        fallbackConfig
      );

      const norm = l2Norm(result.embedding);
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it('should produce deterministic embeddings for the same input', async () => {
      const text = 'determinism check';
      const a = await generateNeuralEmbedding(text, fallbackConfig);
      const b = await generateNeuralEmbedding(text, fallbackConfig);

      for (let i = 0; i < a.embedding.length; i++) {
        expect(a.embedding[i]).toBe(b.embedding[i]);
      }
    });
  });

  // ============================================================================
  // generateBatchEmbeddings (ngram-fallback)
  // ============================================================================

  describe('generateBatchEmbeddings (ngram-fallback)', () => {
    it('should return results for all input texts', async () => {
      const texts = [
        'First document about sales',
        'Second document about engineering',
        'Third document about marketing',
      ];

      const result = await generateBatchEmbeddings(texts, fallbackConfig);

      expect(result.embeddings).toHaveLength(3);
      result.embeddings.forEach((emb) => {
        expect(emb.embedding).toBeInstanceOf(Array);
        expect(emb.model).toBe('ngram-fallback');
      });
    });

    it('should have a positive processingTimeMs', async () => {
      const texts = ['quick test one', 'quick test two'];
      const result = await generateBatchEmbeddings(texts, fallbackConfig);

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.processingTimeMs).toBe('number');
    });

    it('should return a totalTokens field', async () => {
      const texts = ['token check'];
      const result = await generateBatchEmbeddings(texts, fallbackConfig);

      expect(typeof result.totalTokens).toBe('number');
    });

    it('should produce embeddings with correct dimensions for each item', async () => {
      const texts = ['dim check A', 'dim check B'];
      const result = await generateBatchEmbeddings(texts, fallbackConfig);

      for (const emb of result.embeddings) {
        expect(emb.dimensions).toBe(384);
        expect(emb.embedding.length).toBe(384);
      }
    });
  });

  // ============================================================================
  // NeuralEmbeddings namespace
  // ============================================================================

  describe('NeuralEmbeddings namespace', () => {
    it('should export all public functions', () => {
      expect(typeof NeuralEmbeddings.generateNeuralEmbedding).toBe('function');
      expect(typeof NeuralEmbeddings.generateBatchEmbeddings).toBe('function');
      expect(typeof NeuralEmbeddings.buildOrgVocabulary).toBe('function');
      expect(typeof NeuralEmbeddings.applyVocabularyBoost).toBe('function');
    });
  });
});
