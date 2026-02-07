/**
 * Nexus Memory Stack - Embedding Cache Tests
 *
 * Comprehensive tests for the embedding cache module including:
 * - Basic CRUD operations (get, set, has, remove)
 * - TTL-based expiration
 * - LRU eviction policy
 * - Memory limit enforcement
 * - Hit/miss statistics tracking
 * - Batch operations (getMany, setMany)
 * - Prefix operations (getByPrefix, removeByPrefix)
 * - Export/import state roundtrip
 * - Content-hashed cache operations
 * - Edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createEmbeddingCache,
  createContentHashedCache,
} from '../core/embeddings/embedding-cache';

// ============================================================================
// TEST DATA
// ============================================================================

const sampleEmbedding1 = [0.1, 0.2, 0.3, 0.4, 0.5];
const sampleEmbedding2 = [0.5, 0.4, 0.3, 0.2, 0.1];
const sampleEmbedding3 = [1.0, 0.0, 1.0, 0.0, 1.0];
const sampleEmbedding4 = [0.0, 1.0, 0.0, 1.0, 0.0];

// ============================================================================
// createEmbeddingCache TESTS
// ============================================================================

describe('Embedding Cache', () => {
  // --------------------------------------------------------------------------
  // Basic get/set/has/remove operations
  // --------------------------------------------------------------------------

  describe('Basic CRUD operations', () => {
    it('should set and get a value', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('key1', sampleEmbedding1);
      const result = cache.get('key1');
      expect(result).toEqual(sampleEmbedding1);
    });

    it('should return null for a missing key', () => {
      const cache = createEmbeddingCache<number[]>();
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should report has correctly for existing keys', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('key1', sampleEmbedding1);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('missing')).toBe(false);
    });

    it('should remove an entry and return true', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('key1', sampleEmbedding1);
      const removed = cache.remove('key1');
      expect(removed).toBe(true);
      expect(cache.get('key1')).toBeNull();
    });

    it('should return false when removing a nonexistent key', () => {
      const cache = createEmbeddingCache<number[]>();
      const removed = cache.remove('nonexistent');
      expect(removed).toBe(false);
    });

    it('should overwrite an existing key with set', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('key1', sampleEmbedding1);
      cache.set('key1', sampleEmbedding2);
      const result = cache.get('key1');
      expect(result).toEqual(sampleEmbedding2);
    });

    it('should store metadata alongside the value', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('key1', sampleEmbedding1, { model: 'text-embedding-ada-002' });
      const exported = cache.exportState();
      const entry = exported.find((e) => e.key === 'key1');
      expect(entry?.entry.metadata).toEqual({ model: 'text-embedding-ada-002' });
    });

    it('should return all keys', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('alpha', sampleEmbedding1);
      cache.set('beta', sampleEmbedding2);
      cache.set('gamma', sampleEmbedding3);
      const allKeys = cache.keys();
      expect(allKeys).toHaveLength(3);
      expect(allKeys).toContain('alpha');
      expect(allKeys).toContain('beta');
      expect(allKeys).toContain('gamma');
    });

    it('should return an empty keys array for an empty cache', () => {
      const cache = createEmbeddingCache<number[]>();
      expect(cache.keys()).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Clear
  // --------------------------------------------------------------------------

  describe('clear', () => {
    it('should remove all entries from the cache', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('a', sampleEmbedding1);
      cache.set('b', sampleEmbedding2);
      cache.set('c', sampleEmbedding3);
      cache.clear();
      expect(cache.keys()).toHaveLength(0);
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBeNull();
      expect(cache.get('c')).toBeNull();
    });

    it('should reset memory tracking after clear', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('a', sampleEmbedding1);
      cache.clear();
      const stats = cache.getStats();
      expect(stats.memoryUsedBytes).toBe(0);
      expect(stats.entries).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // TTL expiration
  // --------------------------------------------------------------------------

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return the value before TTL expires', () => {
      const cache = createEmbeddingCache<number[]>({ ttlSeconds: 60 });
      cache.set('key1', sampleEmbedding1);

      vi.advanceTimersByTime(30_000); // 30 seconds
      expect(cache.get('key1')).toEqual(sampleEmbedding1);
    });

    it('should return null after TTL expires on get', () => {
      const cache = createEmbeddingCache<number[]>({ ttlSeconds: 60 });
      cache.set('key1', sampleEmbedding1);

      vi.advanceTimersByTime(61_000); // 61 seconds
      expect(cache.get('key1')).toBeNull();
    });

    it('should report has as false after TTL expires', () => {
      const cache = createEmbeddingCache<number[]>({ ttlSeconds: 10 });
      cache.set('key1', sampleEmbedding1);

      vi.advanceTimersByTime(11_000);
      expect(cache.has('key1')).toBe(false);
    });

    it('should increment expirations counter on TTL miss via get', () => {
      const cache = createEmbeddingCache<number[]>({ ttlSeconds: 5 });
      cache.set('key1', sampleEmbedding1);

      vi.advanceTimersByTime(6_000);
      cache.get('key1');

      const stats = cache.getStats();
      expect(stats.expirations).toBe(1);
    });

    it('should increment expirations counter on TTL miss via has', () => {
      const cache = createEmbeddingCache<number[]>({ ttlSeconds: 5 });
      cache.set('key1', sampleEmbedding1);

      vi.advanceTimersByTime(6_000);
      cache.has('key1');

      const stats = cache.getStats();
      expect(stats.expirations).toBe(1);
    });

    it('cleanup should remove all expired entries and return count', () => {
      const cache = createEmbeddingCache<number[]>({ ttlSeconds: 10 });
      cache.set('a', sampleEmbedding1);
      cache.set('b', sampleEmbedding2);

      vi.advanceTimersByTime(11_000);

      cache.set('c', sampleEmbedding3); // This one is fresh

      const cleaned = cache.cleanup();
      expect(cleaned).toBe(2);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(false);
      expect(cache.has('c')).toBe(true);
    });

    it('cleanup should return 0 when nothing is expired', () => {
      const cache = createEmbeddingCache<number[]>({ ttlSeconds: 3600 });
      cache.set('a', sampleEmbedding1);
      const cleaned = cache.cleanup();
      expect(cleaned).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // LRU eviction
  // --------------------------------------------------------------------------

  describe('LRU eviction', () => {
    it('should evict the least recently used entry when maxEntries is exceeded', () => {
      const cache = createEmbeddingCache<number[]>({ maxEntries: 3 });
      cache.set('first', sampleEmbedding1);
      cache.set('second', sampleEmbedding2);
      cache.set('third', sampleEmbedding3);

      // Adding a 4th entry should evict 'first'
      cache.set('fourth', sampleEmbedding4);

      expect(cache.get('first')).toBeNull();
      expect(cache.has('second')).toBe(true);
      expect(cache.has('third')).toBe(true);
      expect(cache.has('fourth')).toBe(true);
    });

    it('should evict the correct entry after access reordering', () => {
      const cache = createEmbeddingCache<number[]>({ maxEntries: 3 });
      cache.set('first', sampleEmbedding1);
      cache.set('second', sampleEmbedding2);
      cache.set('third', sampleEmbedding3);

      // Access 'first' to promote it
      cache.get('first');

      // Now 'second' is the LRU
      cache.set('fourth', sampleEmbedding4);

      expect(cache.has('first')).toBe(true);
      expect(cache.get('second')).toBeNull();
      expect(cache.has('third')).toBe(true);
      expect(cache.has('fourth')).toBe(true);
    });

    it('should track evictions in stats', () => {
      const cache = createEmbeddingCache<number[]>({ maxEntries: 2 });
      cache.set('a', sampleEmbedding1);
      cache.set('b', sampleEmbedding2);
      cache.set('c', sampleEmbedding3);

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });

    it('should evict multiple entries if needed', () => {
      const cache = createEmbeddingCache<number[]>({ maxEntries: 2 });
      cache.set('a', sampleEmbedding1);
      cache.set('b', sampleEmbedding2);

      // Adding two more in sequence
      cache.set('c', sampleEmbedding3);
      cache.set('d', sampleEmbedding4);

      const stats = cache.getStats();
      expect(stats.evictions).toBe(2);
      expect(stats.entries).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Memory limit enforcement
  // --------------------------------------------------------------------------

  describe('Memory limit enforcement', () => {
    it('should evict entries when memory limit is exceeded', () => {
      // Each 5-element number[] is ~40 bytes (5 * 8)
      // maxMemoryMB of 0.0001 MB = ~104 bytes, so roughly 2 entries
      const cache = createEmbeddingCache<number[]>({
        maxEntries: 100,
        maxMemoryMB: 0.0001, // ~104 bytes
      });

      cache.set('a', sampleEmbedding1); // 40 bytes
      cache.set('b', sampleEmbedding2); // 40 bytes
      cache.set('c', sampleEmbedding3); // 40 bytes -- should trigger eviction

      const stats = cache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
    });

    it('should track memory usage in stats', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('a', sampleEmbedding1); // 5 numbers * 8 bytes = 40 bytes

      const stats = cache.getStats();
      expect(stats.memoryUsedBytes).toBe(40);
      expect(stats.memoryUsedMB).toBeCloseTo(40 / (1024 * 1024), 6);
    });

    it('should decrease memory usage after removal', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('a', sampleEmbedding1);
      cache.set('b', sampleEmbedding2);

      cache.remove('a');
      const stats = cache.getStats();
      expect(stats.memoryUsedBytes).toBe(40); // Only 'b' remains
    });
  });

  // --------------------------------------------------------------------------
  // Hit/miss statistics
  // --------------------------------------------------------------------------

  describe('Hit/miss statistics', () => {
    it('should start with zero hits and misses', () => {
      const cache = createEmbeddingCache<number[]>();
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('should count hits on successful get', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('key1', sampleEmbedding1);
      cache.get('key1');
      cache.get('key1');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });

    it('should count misses on failed get', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.get('nonexistent1');
      cache.get('nonexistent2');

      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
    });

    it('should calculate hitRate correctly', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('key1', sampleEmbedding1);

      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('missing'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3, 5);
    });

    it('should count misses for expired entries', () => {
      vi.useFakeTimers();
      const cache = createEmbeddingCache<number[]>({ ttlSeconds: 5 });
      cache.set('key1', sampleEmbedding1);
      vi.advanceTimersByTime(6_000);

      cache.get('key1'); // miss (expired)

      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
      vi.useRealTimers();
    });

    it('should report correct entry count', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('a', sampleEmbedding1);
      cache.set('b', sampleEmbedding2);
      cache.set('c', sampleEmbedding3);

      expect(cache.getStats().entries).toBe(3);

      cache.remove('b');
      expect(cache.getStats().entries).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Batch operations
  // --------------------------------------------------------------------------

  describe('Batch operations', () => {
    it('getMany should return a map of found entries', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('a', sampleEmbedding1);
      cache.set('b', sampleEmbedding2);
      cache.set('c', sampleEmbedding3);

      const results = cache.getMany(['a', 'c', 'nonexistent']);
      expect(results.size).toBe(2);
      expect(results.get('a')).toEqual(sampleEmbedding1);
      expect(results.get('c')).toEqual(sampleEmbedding3);
      expect(results.has('nonexistent')).toBe(false);
    });

    it('getMany with empty keys array returns empty map', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('a', sampleEmbedding1);
      const results = cache.getMany([]);
      expect(results.size).toBe(0);
    });

    it('setMany should set multiple entries at once', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.setMany([
        { key: 'x', value: sampleEmbedding1 },
        { key: 'y', value: sampleEmbedding2, metadata: { source: 'batch' } },
        { key: 'z', value: sampleEmbedding3 },
      ]);

      expect(cache.get('x')).toEqual(sampleEmbedding1);
      expect(cache.get('y')).toEqual(sampleEmbedding2);
      expect(cache.get('z')).toEqual(sampleEmbedding3);
      expect(cache.getStats().entries).toBe(3);
    });

    it('getMany should update hit/miss counters', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('a', sampleEmbedding1);
      cache.set('b', sampleEmbedding2);

      cache.getMany(['a', 'b', 'missing1', 'missing2']);

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Prefix operations
  // --------------------------------------------------------------------------

  describe('Prefix operations', () => {
    it('getByPrefix should return matching entries', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('user:1', sampleEmbedding1);
      cache.set('user:2', sampleEmbedding2);
      cache.set('doc:1', sampleEmbedding3);
      cache.set('doc:2', sampleEmbedding4);

      const userEntries = cache.getByPrefix('user:');
      expect(userEntries.size).toBe(2);
      expect(userEntries.get('user:1')).toEqual(sampleEmbedding1);
      expect(userEntries.get('user:2')).toEqual(sampleEmbedding2);
    });

    it('getByPrefix should return empty map for no matches', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('user:1', sampleEmbedding1);

      const results = cache.getByPrefix('order:');
      expect(results.size).toBe(0);
    });

    it('removeByPrefix should remove matching entries and return count', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('temp:a', sampleEmbedding1);
      cache.set('temp:b', sampleEmbedding2);
      cache.set('perm:c', sampleEmbedding3);

      const removedCount = cache.removeByPrefix('temp:');
      expect(removedCount).toBe(2);
      expect(cache.has('temp:a')).toBe(false);
      expect(cache.has('temp:b')).toBe(false);
      expect(cache.has('perm:c')).toBe(true);
    });

    it('removeByPrefix should return 0 for no matches', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('a', sampleEmbedding1);

      const removedCount = cache.removeByPrefix('xyz:');
      expect(removedCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Export/Import state roundtrip
  // --------------------------------------------------------------------------

  describe('Export/Import state roundtrip', () => {
    it('should export and import cache state correctly', () => {
      const cache1 = createEmbeddingCache<number[]>({ ttlSeconds: 3600 });
      cache1.set('k1', sampleEmbedding1, { model: 'ada' });
      cache1.set('k2', sampleEmbedding2);

      const state = cache1.exportState();
      expect(state).toHaveLength(2);

      const cache2 = createEmbeddingCache<number[]>({ ttlSeconds: 3600 });
      cache2.importState(state);

      expect(cache2.get('k1')).toEqual(sampleEmbedding1);
      expect(cache2.get('k2')).toEqual(sampleEmbedding2);
      expect(cache2.keys()).toHaveLength(2);
    });

    it('should skip expired entries on import', () => {
      vi.useFakeTimers();
      const cache1 = createEmbeddingCache<number[]>({ ttlSeconds: 10 });
      cache1.set('fresh', sampleEmbedding1);
      cache1.set('stale', sampleEmbedding2);

      const state = cache1.exportState();

      vi.advanceTimersByTime(11_000);

      const cache2 = createEmbeddingCache<number[]>({ ttlSeconds: 10 });
      cache2.importState(state);

      // Both entries are now expired
      expect(cache2.keys()).toHaveLength(0);
      vi.useRealTimers();
    });

    it('import should clear existing entries', () => {
      const cache = createEmbeddingCache<number[]>({ ttlSeconds: 3600 });
      cache.set('existing', sampleEmbedding1);

      const importedState = [
        {
          key: 'imported',
          entry: {
            key: 'imported',
            value: sampleEmbedding2,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 1,
            sizeBytes: 40,
          },
        },
      ];

      cache.importState(importedState);
      expect(cache.has('existing')).toBe(false);
      expect(cache.get('imported')).toEqual(sampleEmbedding2);
    });

    it('exported state should contain entry metadata', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('k', sampleEmbedding1, { model: 'v2', source: 'test' });

      const state = cache.exportState();
      expect(state[0].entry.metadata).toEqual({ model: 'v2', source: 'test' });
      expect(state[0].entry.sizeBytes).toBe(40);
      expect(state[0].entry.accessCount).toBe(1);
    });

    it('import should restore memory tracking', () => {
      const cache1 = createEmbeddingCache<number[]>({ ttlSeconds: 3600 });
      cache1.set('a', sampleEmbedding1);
      cache1.set('b', sampleEmbedding2);
      const state = cache1.exportState();

      const cache2 = createEmbeddingCache<number[]>({ ttlSeconds: 3600 });
      cache2.importState(state);

      const stats = cache2.getStats();
      expect(stats.memoryUsedBytes).toBe(80); // 2 * 40 bytes
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('should handle string values with estimateSize', () => {
      const cache = createEmbeddingCache<string>();
      cache.set('s1', 'hello');
      const stats = cache.getStats();
      // 'hello' is 5 chars * 2 bytes (UTF-16) = 10 bytes
      expect(stats.memoryUsedBytes).toBe(10);
    });

    it('should handle object values with estimateSize', () => {
      const cache = createEmbeddingCache<{ x: number }>();
      cache.set('obj', { x: 42 });
      const stats = cache.getStats();
      // JSON.stringify({x:42}).length * 2 = '{"x":42}'.length * 2 = 8 * 2 = 16
      expect(stats.memoryUsedBytes).toBe(16);
    });

    it('should handle maxEntries of 1', () => {
      const cache = createEmbeddingCache<number[]>({ maxEntries: 1 });
      cache.set('only', sampleEmbedding1);
      cache.set('replacement', sampleEmbedding2);

      expect(cache.get('only')).toBeNull();
      expect(cache.get('replacement')).toEqual(sampleEmbedding2);
      expect(cache.getStats().entries).toBe(1);
    });

    it('should use default config when none provided', () => {
      const cache = createEmbeddingCache();
      // Should not throw; defaults are maxEntries=10000, ttlSeconds=3600, etc.
      cache.set('key', [1, 2, 3]);
      expect(cache.get('key')).toEqual([1, 2, 3]);
    });

    it('clear on empty cache should not throw', () => {
      const cache = createEmbeddingCache<number[]>();
      expect(() => cache.clear()).not.toThrow();
    });

    it('cleanup on empty cache should return 0', () => {
      const cache = createEmbeddingCache<number[]>();
      expect(cache.cleanup()).toBe(0);
    });

    it('should handle setting the same key multiple times', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('dup', sampleEmbedding1);
      cache.set('dup', sampleEmbedding2);
      cache.set('dup', sampleEmbedding3);

      expect(cache.get('dup')).toEqual(sampleEmbedding3);
      expect(cache.getStats().entries).toBe(1);
      // Memory should reflect only one entry (40 bytes)
      expect(cache.getStats().memoryUsedBytes).toBe(40);
    });

    it('access count should increment on repeated gets', () => {
      const cache = createEmbeddingCache<number[]>();
      cache.set('k', sampleEmbedding1);
      cache.get('k');
      cache.get('k');
      cache.get('k');

      const state = cache.exportState();
      const entry = state.find((e) => e.key === 'k');
      // Initial accessCount is 1 from set, then 3 gets => 4
      expect(entry?.entry.accessCount).toBe(4);
    });
  });

  // --------------------------------------------------------------------------
  // Access order (LRU) preservation on import
  // --------------------------------------------------------------------------

  describe('Import access order', () => {
    it('should sort imported entries by lastAccessedAt for LRU order', () => {
      const now = Date.now();
      const state = [
        {
          key: 'recent',
          entry: {
            key: 'recent',
            value: sampleEmbedding1,
            createdAt: now,
            lastAccessedAt: now + 2000,
            accessCount: 3,
            sizeBytes: 40,
          },
        },
        {
          key: 'oldest',
          entry: {
            key: 'oldest',
            value: sampleEmbedding2,
            createdAt: now,
            lastAccessedAt: now,
            accessCount: 1,
            sizeBytes: 40,
          },
        },
        {
          key: 'middle',
          entry: {
            key: 'middle',
            value: sampleEmbedding3,
            createdAt: now,
            lastAccessedAt: now + 1000,
            accessCount: 2,
            sizeBytes: 40,
          },
        },
      ];

      const cache = createEmbeddingCache<number[]>({
        maxEntries: 3,
        ttlSeconds: 3600,
      });
      cache.importState(state);

      // All three should be present
      expect(cache.keys()).toHaveLength(3);

      // Now add a 4th entry -- 'oldest' should be evicted (LRU)
      cache.set('fourth', sampleEmbedding4);
      expect(cache.has('oldest')).toBe(false);
      expect(cache.has('middle')).toBe(true);
      expect(cache.has('recent')).toBe(true);
      expect(cache.has('fourth')).toBe(true);
    });
  });
});

// ============================================================================
// createContentHashedCache TESTS
// ============================================================================

describe('Content Hashed Cache', () => {
  // --------------------------------------------------------------------------
  // hashContent
  // --------------------------------------------------------------------------

  describe('hashContent', () => {
    it('should produce a deterministic hash for the same content and model', () => {
      const cache = createContentHashedCache();
      const hash1 = cache.hashContent('hello world', 'model-a');
      const hash2 = cache.hashContent('hello world', 'model-a');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', () => {
      const cache = createContentHashedCache();
      const hash1 = cache.hashContent('hello', 'model-a');
      const hash2 = cache.hashContent('world', 'model-a');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different models with same content', () => {
      const cache = createContentHashedCache();
      const hash1 = cache.hashContent('hello', 'model-a');
      const hash2 = cache.hashContent('hello', 'model-b');
      expect(hash1).not.toBe(hash2);
    });

    it('should return a string prefixed with emb_', () => {
      const cache = createContentHashedCache();
      const hash = cache.hashContent('test content', 'v1');
      expect(hash).toMatch(/^emb_/);
    });
  });

  // --------------------------------------------------------------------------
  // setByContent / getByContent / hasByContent
  // --------------------------------------------------------------------------

  describe('Content-based CRUD', () => {
    it('should set and get an embedding by content', () => {
      const cache = createContentHashedCache();
      cache.setByContent('The quick brown fox', 'ada-002', sampleEmbedding1);

      const result = cache.getByContent('The quick brown fox', 'ada-002');
      expect(result).toEqual(sampleEmbedding1);
    });

    it('should return null for content that was not set', () => {
      const cache = createContentHashedCache();
      const result = cache.getByContent('unknown text', 'ada-002');
      expect(result).toBeNull();
    });

    it('should report hasByContent correctly', () => {
      const cache = createContentHashedCache();
      cache.setByContent('present', 'model-x', sampleEmbedding1);

      expect(cache.hasByContent('present', 'model-x')).toBe(true);
      expect(cache.hasByContent('absent', 'model-x')).toBe(false);
    });

    it('hasByContent should return false for different model', () => {
      const cache = createContentHashedCache();
      cache.setByContent('text', 'model-a', sampleEmbedding1);

      expect(cache.hasByContent('text', 'model-a')).toBe(true);
      expect(cache.hasByContent('text', 'model-b')).toBe(false);
    });

    it('setByContent should store truncated content in metadata', () => {
      const cache = createContentHashedCache();
      const longContent = 'A'.repeat(200);
      cache.setByContent(longContent, 'model-z', sampleEmbedding1);

      const exported = cache.exportState();
      expect(exported).toHaveLength(1);
      const metadata = exported[0].entry.metadata as Record<string, unknown>;
      expect(metadata.content).toBe('A'.repeat(100));
      expect(metadata.model).toBe('model-z');
    });
  });

  // --------------------------------------------------------------------------
  // Inherited base cache methods
  // --------------------------------------------------------------------------

  describe('Inherited base cache methods', () => {
    it('should support direct get/set via inherited methods', () => {
      const cache = createContentHashedCache();
      cache.set('direct-key', [9, 8, 7]);
      expect(cache.get('direct-key')).toEqual([9, 8, 7]);
    });

    it('should support clear on content-hashed cache', () => {
      const cache = createContentHashedCache();
      cache.setByContent('a', 'model', sampleEmbedding1);
      cache.setByContent('b', 'model', sampleEmbedding2);
      cache.clear();

      expect(cache.hasByContent('a', 'model')).toBe(false);
      expect(cache.getStats().entries).toBe(0);
    });

    it('should support getStats on content-hashed cache', () => {
      const cache = createContentHashedCache();
      cache.setByContent('text', 'model', sampleEmbedding1);
      cache.getByContent('text', 'model'); // hit
      cache.getByContent('missing', 'model'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.entries).toBe(1);
    });

    it('should support keys on content-hashed cache', () => {
      const cache = createContentHashedCache();
      cache.setByContent('alpha', 'model', sampleEmbedding1);
      cache.setByContent('beta', 'model', sampleEmbedding2);

      const allKeys = cache.keys();
      expect(allKeys).toHaveLength(2);
      allKeys.forEach((key) => {
        expect(key).toMatch(/^emb_/);
      });
    });
  });

  // --------------------------------------------------------------------------
  // TTL on content-hashed cache
  // --------------------------------------------------------------------------

  describe('TTL on content-hashed cache', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire content-hashed entries after TTL', () => {
      const cache = createContentHashedCache({ ttlSeconds: 30 });
      cache.setByContent('text', 'model', sampleEmbedding1);

      vi.advanceTimersByTime(31_000);
      expect(cache.getByContent('text', 'model')).toBeNull();
      expect(cache.hasByContent('text', 'model')).toBe(false);
    });
  });
});
