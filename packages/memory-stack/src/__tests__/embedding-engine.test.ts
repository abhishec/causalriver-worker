/**
 * Nexus Memory Stack - Embedding Engine Tests
 *
 * Tests for the n-gram embedding generation algorithm.
 * Validates determinism, similarity, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  generateEmbedding,
  cosineSimilarity,
  hashString,
  hashContent,
  createEmbeddingEngine,
} from '../core/embeddings';

describe('Embedding Engine', () => {
  // ============================================================================
  // HASH FUNCTION TESTS
  // ============================================================================

  describe('hashString (DJB2)', () => {
    it('should produce consistent hashes for same input', () => {
      const hash1 = hashString('hello');
      const hash2 = hashString('hello');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashString('hello');
      const hash2 = hashString('world');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty strings', () => {
      const hash = hashString('');
      expect(typeof hash).toBe('number');
    });

    it('should handle long strings', () => {
      const longString = 'a'.repeat(10000);
      const hash = hashString(longString);
      expect(typeof hash).toBe('number');
      expect(Number.isFinite(hash)).toBe(true);
    });
  });

  describe('hashContent', () => {
    it('should hash object content deterministically', () => {
      const obj = { name: 'Acme Corp', revenue: 100000 };
      const hash1 = hashContent(obj);
      const hash2 = hashContent(obj);
      expect(hash1).toBe(hash2);
    });

    it('should handle nested objects', () => {
      const obj = { company: { name: 'Acme', address: { city: 'NYC' } } };
      const hash = hashContent(obj);
      expect(typeof hash).toBe('string');
    });
  });

  // ============================================================================
  // EMBEDDING GENERATION TESTS
  // ============================================================================

  describe('generateEmbedding', () => {
    it('should generate embeddings of correct dimension', () => {
      const embedding = generateEmbedding('hello world');
      expect(embedding.length).toBe(384); // Default dimensions
    });

    it('should generate embeddings with custom dimensions', () => {
      const embedding = generateEmbedding('hello world', 128);
      expect(embedding.length).toBe(128);
    });

    it('should produce normalized vectors (L2 norm ~= 1) for non-empty text', () => {
      const embedding = generateEmbedding('test string with content');
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it('should be deterministic - same input produces same output', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const embedding1 = generateEmbedding(text);
      const embedding2 = generateEmbedding(text);
      expect(embedding1).toEqual(embedding2);
    });

    it('should produce different embeddings for different inputs', () => {
      const embedding1 = generateEmbedding('hello');
      const embedding2 = generateEmbedding('goodbye');
      expect(embedding1).not.toEqual(embedding2);
    });

    it('should handle special characters', () => {
      const embedding = generateEmbedding('!@#$%^&*()');
      expect(embedding.length).toBe(384);
    });

    it('should handle numbers in text', () => {
      const embedding = generateEmbedding('Revenue is $1,234,567.89');
      expect(embedding.length).toBe(384);
    });
  });

  // ============================================================================
  // COSINE SIMILARITY TESTS
  // ============================================================================

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const embedding = generateEmbedding('hello world');
      const similarity = cosineSimilarity(embedding, embedding);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should return value between -1 and 1', () => {
      const embedding1 = generateEmbedding('invoice payment due');
      const embedding2 = generateEmbedding('marketing campaign');
      const similarity = cosineSimilarity(embedding1, embedding2);
      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('should be symmetric', () => {
      const embedding1 = generateEmbedding('hello');
      const embedding2 = generateEmbedding('world');
      const sim1 = cosineSimilarity(embedding1, embedding2);
      const sim2 = cosineSimilarity(embedding2, embedding1);
      expect(sim1).toBeCloseTo(sim2, 10);
    });

    it('should throw for mismatched dimensions', () => {
      const v1 = generateEmbedding('hello', 384);
      const v2 = generateEmbedding('world', 128);
      expect(() => cosineSimilarity(v1, v2)).toThrow();
    });
  });

  // ============================================================================
  // SEMANTIC SIMILARITY TESTS
  // ============================================================================

  describe('Semantic Similarity Properties', () => {
    it('should capture word overlap', () => {
      const embedding1 = generateEmbedding('customer success health score');
      const embedding2 = generateEmbedding('customer health success score');
      const similarity = cosineSimilarity(embedding1, embedding2);
      // Should be similar due to same words
      expect(similarity).toBeGreaterThan(0.5);
    });
  });

  // ============================================================================
  // EMBEDDING ENGINE FACTORY TESTS
  // ============================================================================

  describe('createEmbeddingEngine', () => {
    it('should create engine with default config', () => {
      const engine = createEmbeddingEngine({
        entityFormatters: {},
      });
      expect(engine).toBeDefined();
      expect(typeof engine.generateEmbedding).toBe('function');
    });

    it('should use custom entity formatters', () => {
      const engine = createEmbeddingEngine({
        entityFormatters: {
          client: (entity: { name: string; industry: string }) =>
            `${entity.name} in ${entity.industry}`,
        },
      });

      const formatted = engine.formatEntity('client', {
        name: 'Acme Corp',
        industry: 'Technology',
      });
      expect(formatted).toBe('Acme Corp in Technology');
    });

    it('should generate embeddings with configured dimensions', () => {
      const engine = createEmbeddingEngine({
        entityFormatters: {},
        dimensions: 256,
      });

      const embedding = engine.generateEmbedding('test');
      expect(embedding.length).toBe(256);
    });
  });

  // ============================================================================
  // PERFORMANCE CHARACTERISTICS
  // ============================================================================

  describe('Performance', () => {
    it('should generate embeddings quickly (< 10ms for short text)', () => {
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        generateEmbedding('Short test string');
      }
      const elapsed = performance.now() - start;
      // 100 embeddings should take less than 100ms (1ms each)
      expect(elapsed).toBeLessThan(100);
    });

    it('should handle batch processing', () => {
      const texts = Array.from({ length: 1000 }, (_, i) => `Document number ${i}`);
      const start = performance.now();
      const embeddings = texts.map((t) => generateEmbedding(t));
      const elapsed = performance.now() - start;

      expect(embeddings.length).toBe(1000);
      // 1000 embeddings should take less than 2 seconds
      expect(elapsed).toBeLessThan(2000);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle very long text', () => {
      const longText = 'word '.repeat(10000);
      const embedding = generateEmbedding(longText);
      expect(embedding.length).toBe(384);
    });

    it('should handle single character', () => {
      const embedding = generateEmbedding('a');
      expect(embedding.length).toBe(384);
    });

    it('should handle repeated characters', () => {
      const embedding = generateEmbedding('aaaaaaaaaa');
      expect(embedding.length).toBe(384);
    });
  });
});
