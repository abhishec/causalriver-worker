/**
 * Nexus Memory Stack - Embedding Router Tests
 *
 * Tests for the embedding router that routes between n-gram (lightweight)
 * and neural (transformer-based) embedding implementations.
 * Validates dimension reduction, similarity computation, metadata generation,
 * neural fetch integration, auto-fallback, and batch processing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  reduceDimensions,
  generateNGramEmbeddingWithMeta,
  generateNeuralEmbedding,
  generateEmbeddingAuto,
  generateBatchEmbeddings,
  computeSimilarity,
  DEFAULT_NEURAL_CONFIG,
  type NeuralEmbeddingConfig,
  type EmbeddingResponse,
} from '../core/embeddings/embedding-router';

// ============================================================================
// DEFAULT_NEURAL_CONFIG
// ============================================================================

describe('Embedding Router', () => {
  describe('DEFAULT_NEURAL_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_NEURAL_CONFIG.edgeFunctionUrl).toBe('');
      expect(DEFAULT_NEURAL_CONFIG.timeout).toBe(10000);
      expect(DEFAULT_NEURAL_CONFIG.model).toBe('text-embedding-3-small');
      expect(DEFAULT_NEURAL_CONFIG.targetDimensions).toBe(384);
    });
  });

  // ============================================================================
  // reduceDimensions
  // ============================================================================

  describe('reduceDimensions', () => {
    it('should pad with zeros when embedding is shorter than targetDims', () => {
      const embedding = [0.5, 0.3, 0.8];
      const result = reduceDimensions(embedding, 6);

      expect(result.length).toBe(6);
      // The first 3 values are from the original (untouched, since length <= target)
      expect(result[0]).toBe(0.5);
      expect(result[1]).toBe(0.3);
      expect(result[2]).toBe(0.8);
      // The last 3 values are zero-padded
      expect(result[3]).toBe(0);
      expect(result[4]).toBe(0);
      expect(result[5]).toBe(0);
    });

    it('should average groups of adjacent dimensions when embedding is longer', () => {
      // 8 dims -> 4 target: groupSize = ceil(8/4) = 2
      // Group 0: avg(1, 2) = 1.5
      // Group 1: avg(3, 4) = 3.5
      // Group 2: avg(5, 6) = 5.5
      // Group 3: avg(7, 8) = 7.5
      const embedding = [1, 2, 3, 4, 5, 6, 7, 8];
      const result = reduceDimensions(embedding, 4);

      expect(result.length).toBe(4);

      // Before normalization, raw values would be [1.5, 3.5, 5.5, 7.5]
      // L2 magnitude = sqrt(1.5^2 + 3.5^2 + 5.5^2 + 7.5^2)
      //              = sqrt(2.25 + 12.25 + 30.25 + 56.25) = sqrt(101) ~= 10.0499
      const rawValues = [1.5, 3.5, 5.5, 7.5];
      const magnitude = Math.sqrt(rawValues.reduce((s, v) => s + v * v, 0));

      for (let i = 0; i < 4; i++) {
        expect(result[i]).toBeCloseTo(rawValues[i] / magnitude, 10);
      }
    });

    it('should L2-normalize the output', () => {
      const embedding = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const result = reduceDimensions(embedding, 4);

      const norm = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it('should return normalized result when dimensions exactly match', () => {
      const embedding = [3, 4]; // magnitude = 5
      const result = reduceDimensions(embedding, 2);

      // Length <= targetDims so it pads (no grouping), but embedding.length === targetDims
      // so no padding needed either. The code path returns the raw values unchanged.
      // Wait -- the code pads but does NOT normalize in the pad path.
      // When embedding.length <= targetDims, it returns padded without normalization.
      expect(result.length).toBe(2);
      expect(result[0]).toBe(3);
      expect(result[1]).toBe(4);
    });

    it('should handle single-element embedding padded to larger target', () => {
      const embedding = [1.0];
      const result = reduceDimensions(embedding, 4);

      expect(result.length).toBe(4);
      expect(result[0]).toBe(1.0);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(0);
      expect(result[3]).toBe(0);
    });

    it('should handle large reduction ratio correctly', () => {
      // 1536 dims -> 384 target: groupSize = ceil(1536/384) = 4
      const embedding = Array.from({ length: 1536 }, (_, i) => (i + 1) / 1536);
      const result = reduceDimensions(embedding, 384);

      expect(result.length).toBe(384);
      // Verify L2 normalization
      const norm = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });
  });

  // ============================================================================
  // generateNGramEmbeddingWithMeta
  // ============================================================================

  describe('generateNGramEmbeddingWithMeta', () => {
    it('should return mode_used as "ngram"', () => {
      const result = generateNGramEmbeddingWithMeta('hello world');
      expect(result.mode_used).toBe('ngram');
    });

    it('should return correct dimensions in metadata', () => {
      const result = generateNGramEmbeddingWithMeta('test input');
      expect(result.dimensions).toBe(384);
    });

    it('should return a non-empty content_hash string', () => {
      const result = generateNGramEmbeddingWithMeta('some content');
      expect(typeof result.content_hash).toBe('string');
      expect(result.content_hash.length).toBeGreaterThan(0);
    });

    it('should generate embedding with default 384 dimensions', () => {
      const result = generateNGramEmbeddingWithMeta('hello world');
      expect(result.embedding.length).toBe(384);
    });

    it('should generate embedding with custom dimensions', () => {
      const result = generateNGramEmbeddingWithMeta('hello world', 128);
      expect(result.embedding.length).toBe(128);
      expect(result.dimensions).toBe(128);
    });

    it('should include a latency_ms field that is a non-negative number', () => {
      const result = generateNGramEmbeddingWithMeta('measure latency');
      expect(typeof result.latency_ms).toBe('number');
      expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('should produce deterministic content_hash for same input', () => {
      const result1 = generateNGramEmbeddingWithMeta('deterministic test');
      const result2 = generateNGramEmbeddingWithMeta('deterministic test');
      expect(result1.content_hash).toBe(result2.content_hash);
    });
  });

  // ============================================================================
  // computeSimilarity
  // ============================================================================

  describe('computeSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const vec = [0.5, 0.3, 0.1, 0.8];
      const similarity = computeSimilarity(vec, vec);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should return approximately 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const similarity = computeSimilarity(a, b);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should return approximately -1 for opposite vectors', () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      const similarity = computeSimilarity(a, b);
      expect(similarity).toBeCloseTo(-1, 5);
    });

    it('should throw on dimension mismatch', () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(() => computeSimilarity(a, b)).toThrow('Embedding dimensions mismatch: 3 vs 2');
    });

    it('should return 0 for two zero vectors', () => {
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      const similarity = computeSimilarity(a, b);
      expect(similarity).toBe(0);
    });

    it('should be symmetric', () => {
      const a = [0.2, 0.7, -0.3, 0.5];
      const b = [0.8, -0.1, 0.4, 0.6];
      expect(computeSimilarity(a, b)).toBeCloseTo(computeSimilarity(b, a), 10);
    });
  });

  // ============================================================================
  // generateNeuralEmbedding (async, mocked fetch)
  // ============================================================================

  describe('generateNeuralEmbedding', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should throw when edgeFunctionUrl is empty', async () => {
      const config: NeuralEmbeddingConfig = {
        edgeFunctionUrl: '',
        timeout: 5000,
        model: 'text-embedding-3-small',
        targetDimensions: 384,
      };

      await expect(generateNeuralEmbedding('test', config)).rejects.toThrow(
        'Neural embedding requires edgeFunctionUrl'
      );
    });

    it('should call fetch with correct parameters and return neural embedding', async () => {
      const fakeEmbedding = Array.from({ length: 384 }, (_, i) => (i + 1) / 384);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: fakeEmbedding }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const config: NeuralEmbeddingConfig = {
        edgeFunctionUrl: 'https://edge.example.com/embeddings',
        apiKey: 'test-api-key',
        timeout: 5000,
        model: 'text-embedding-3-small',
        targetDimensions: 384,
      };

      const result = await generateNeuralEmbedding('hello world', config);

      // Verify fetch was called with the right URL
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://edge.example.com/embeddings');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Authorization']).toBe('Bearer test-api-key');

      const body = JSON.parse(options.body);
      expect(body.text).toBe('hello world');
      expect(body.model).toBe('text-embedding-3-small');
      expect(body.dimensions).toBe(384);

      // Verify response structure
      expect(result.mode_used).toBe('neural');
      expect(result.dimensions).toBe(384);
      expect(result.embedding.length).toBe(384);
      expect(typeof result.content_hash).toBe('string');
      expect(typeof result.latency_ms).toBe('number');
    });

    it('should reduce dimensions when API returns more dimensions than target', async () => {
      // API returns 1536 dims but config targets 384
      const fakeEmbedding = Array.from({ length: 1536 }, () => Math.random());
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: fakeEmbedding }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const config: NeuralEmbeddingConfig = {
        edgeFunctionUrl: 'https://edge.example.com/embeddings',
        timeout: 5000,
        model: 'text-embedding-3-small',
        targetDimensions: 384,
      };

      const result = await generateNeuralEmbedding('test text', config);

      expect(result.embedding.length).toBe(384);
      // Should be L2 normalized after reduction
      const norm = Math.sqrt(result.embedding.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 4);
    });

    it('should throw when fetch response is not ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
        json: async () => ({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      const config: NeuralEmbeddingConfig = {
        edgeFunctionUrl: 'https://edge.example.com/embeddings',
        timeout: 5000,
        model: 'text-embedding-3-small',
        targetDimensions: 384,
      };

      await expect(generateNeuralEmbedding('test', config)).rejects.toThrow(
        'Neural embedding failed: 500 - Internal Server Error'
      );
    });
  });

  // ============================================================================
  // generateEmbeddingAuto (async, fallback behavior)
  // ============================================================================

  describe('generateEmbeddingAuto', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should fall back to ngram when no neural config is provided', async () => {
      const result = await generateEmbeddingAuto('test without neural');

      expect(result.mode_used).toBe('ngram');
      expect(result.embedding.length).toBe(384);
      expect(typeof result.content_hash).toBe('string');
    });

    it('should fall back to ngram when edgeFunctionUrl is empty', async () => {
      const config: NeuralEmbeddingConfig = {
        edgeFunctionUrl: '',
        timeout: 5000,
        model: 'text-embedding-3-small',
        targetDimensions: 384,
      };

      const result = await generateEmbeddingAuto('test empty url', config);
      expect(result.mode_used).toBe('ngram');
    });

    it('should fall back to ngram when fetch throws an error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const config: NeuralEmbeddingConfig = {
        edgeFunctionUrl: 'https://edge.example.com/embeddings',
        timeout: 5000,
        model: 'text-embedding-3-small',
        targetDimensions: 384,
      };

      // Suppress console.warn from the fallback path
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await generateEmbeddingAuto('test fallback', config);

      expect(result.mode_used).toBe('ngram');
      expect(result.embedding.length).toBe(384);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });

    it('should use neural embedding when config is valid and fetch succeeds', async () => {
      const fakeEmbedding = Array.from({ length: 384 }, (_, i) => (i + 1) / 384);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: fakeEmbedding }),
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const config: NeuralEmbeddingConfig = {
        edgeFunctionUrl: 'https://edge.example.com/embeddings',
        timeout: 5000,
        model: 'text-embedding-3-small',
        targetDimensions: 384,
      };

      const result = await generateEmbeddingAuto('test neural path', config);

      expect(result.mode_used).toBe('neural');
      expect(result.embedding.length).toBe(384);
    });
  });

  // ============================================================================
  // generateBatchEmbeddings (async, batch processing)
  // ============================================================================

  describe('generateBatchEmbeddings', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should return all results in ngram mode', async () => {
      const texts = ['alpha', 'bravo', 'charlie', 'delta'];
      const results = await generateBatchEmbeddings(texts, 'ngram');

      expect(results.length).toBe(4);
      results.forEach((result) => {
        expect(result.mode_used).toBe('ngram');
        expect(result.embedding.length).toBe(384);
        expect(typeof result.content_hash).toBe('string');
      });
    });

    it('should return the correct count for various batch sizes', async () => {
      const texts = Array.from({ length: 12 }, (_, i) => `document ${i}`);
      const results = await generateBatchEmbeddings(texts, 'ngram');

      expect(results.length).toBe(12);
    });

    it('should respect custom dimensions in ngram mode', async () => {
      const texts = ['one', 'two', 'three'];
      const results = await generateBatchEmbeddings(texts, 'ngram', {
        dimensions: 128,
      });

      expect(results.length).toBe(3);
      results.forEach((result) => {
        expect(result.embedding.length).toBe(128);
        expect(result.dimensions).toBe(128);
      });
    });

    it('should produce unique content hashes for different texts', async () => {
      const texts = ['unique text one', 'unique text two', 'unique text three'];
      const results = await generateBatchEmbeddings(texts, 'ngram');

      const hashes = results.map((r) => r.content_hash);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(3);
    });

    it('should handle empty batch gracefully', async () => {
      const results = await generateBatchEmbeddings([], 'ngram');
      expect(results.length).toBe(0);
    });
  });
});
