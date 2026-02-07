/**
 * Embedding Cache Module
 * 
 * High-performance caching layer for embeddings with LRU eviction,
 * TTL expiration, and memory-efficient storage.
 * 
 * Features:
 * - LRU eviction policy
 * - TTL-based expiration
 * - Memory usage tracking
 * - Batch operations
 * - Persistence hooks
 */

// ============================================================================
// TYPES
// ============================================================================

export interface EmbeddingCacheConfig {
  /** Maximum number of entries */
  maxEntries: number;
  /** TTL in seconds (default: 1 hour) */
  ttlSeconds: number;
  /** Maximum memory usage in MB */
  maxMemoryMB: number;
  /** Enable compression for large embeddings */
  enableCompression: boolean;
}

export interface CacheEntry<T = number[]> {
  key: string;
  value: T;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  sizeBytes: number;
  metadata?: Record<string, unknown>;
}

export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  hitRate: number;
  memoryUsedBytes: number;
  memoryUsedMB: number;
  evictions: number;
  expirations: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CACHE_CONFIG: EmbeddingCacheConfig = {
  maxEntries: 10000,
  ttlSeconds: 3600, // 1 hour
  maxMemoryMB: 100,
  enableCompression: false
};

// ============================================================================
// EMBEDDING CACHE IMPLEMENTATION
// ============================================================================

/**
 * Create an embedding cache with LRU eviction
 */
export function createEmbeddingCache<T = number[]>(
  config: Partial<EmbeddingCacheConfig> = {}
) {
  const fullConfig: EmbeddingCacheConfig = {
    ...DEFAULT_CACHE_CONFIG,
    ...config
  };
  
  // Storage
  const cache = new Map<string, CacheEntry<T>>();
  const accessOrder: string[] = []; // For LRU tracking
  
  // Stats
  let hits = 0;
  let misses = 0;
  let evictions = 0;
  let expirations = 0;
  let totalMemoryBytes = 0;
  
  /**
   * Get entry from cache
   */
  function get(key: string): T | null {
    const entry = cache.get(key);
    
    if (!entry) {
      misses++;
      return null;
    }
    
    // Check TTL
    const age = (Date.now() - entry.createdAt) / 1000;
    if (age > fullConfig.ttlSeconds) {
      remove(key);
      expirations++;
      misses++;
      return null;
    }
    
    // Update access tracking
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    updateAccessOrder(key);
    
    hits++;
    return entry.value;
  }
  
  /**
   * Set entry in cache
   */
  function set(
    key: string,
    value: T,
    metadata?: Record<string, unknown>
  ): void {
    const sizeBytes = estimateSize(value);
    
    // Evict if necessary
    while (
      (cache.size >= fullConfig.maxEntries || 
       totalMemoryBytes + sizeBytes > fullConfig.maxMemoryMB * 1024 * 1024) &&
      cache.size > 0
    ) {
      evictLRU();
    }
    
    // Remove existing entry if present
    if (cache.has(key)) {
      remove(key);
    }
    
    // Add new entry
    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 1,
      sizeBytes,
      metadata
    };
    
    cache.set(key, entry);
    accessOrder.push(key);
    totalMemoryBytes += sizeBytes;
  }
  
  /**
   * Check if key exists (without updating access time)
   */
  function has(key: string): boolean {
    const entry = cache.get(key);
    if (!entry) return false;
    
    // Check TTL
    const age = (Date.now() - entry.createdAt) / 1000;
    if (age > fullConfig.ttlSeconds) {
      remove(key);
      expirations++;
      return false;
    }
    
    return true;
  }
  
  /**
   * Remove entry from cache
   */
  function remove(key: string): boolean {
    const entry = cache.get(key);
    if (!entry) return false;
    
    cache.delete(key);
    totalMemoryBytes -= entry.sizeBytes;
    
    const orderIndex = accessOrder.indexOf(key);
    if (orderIndex !== -1) {
      accessOrder.splice(orderIndex, 1);
    }
    
    return true;
  }
  
  /**
   * Evict least recently used entry
   */
  function evictLRU(): void {
    if (accessOrder.length === 0) return;
    
    const lruKey = accessOrder[0];
    remove(lruKey);
    evictions++;
  }
  
  /**
   * Update access order for LRU tracking
   */
  function updateAccessOrder(key: string): void {
    const index = accessOrder.indexOf(key);
    if (index !== -1) {
      accessOrder.splice(index, 1);
    }
    accessOrder.push(key);
  }
  
  /**
   * Estimate memory size of value
   */
  function estimateSize(value: T): number {
    if (Array.isArray(value)) {
      // Assume 8 bytes per number (64-bit float)
      return value.length * 8;
    }
    if (typeof value === 'string') {
      return value.length * 2; // UTF-16
    }
    return JSON.stringify(value).length * 2;
  }
  
  /**
   * Get multiple entries
   */
  function getMany(keys: string[]): Map<string, T> {
    const results = new Map<string, T>();
    
    for (const key of keys) {
      const value = get(key);
      if (value !== null) {
        results.set(key, value);
      }
    }
    
    return results;
  }
  
  /**
   * Set multiple entries
   */
  function setMany(entries: Array<{ key: string; value: T; metadata?: Record<string, unknown> }>): void {
    for (const { key, value, metadata } of entries) {
      set(key, value, metadata);
    }
  }
  
  /**
   * Clear all entries
   */
  function clear(): void {
    cache.clear();
    accessOrder.length = 0;
    totalMemoryBytes = 0;
  }
  
  /**
   * Clean up expired entries
   */
  function cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of cache) {
      const age = (now - entry.createdAt) / 1000;
      if (age > fullConfig.ttlSeconds) {
        remove(key);
        expirations++;
        cleaned++;
      }
    }
    
    return cleaned;
  }
  
  /**
   * Get cache statistics
   */
  function getStats(): CacheStats {
    const totalRequests = hits + misses;
    
    return {
      entries: cache.size,
      hits,
      misses,
      hitRate: totalRequests > 0 ? hits / totalRequests : 0,
      memoryUsedBytes: totalMemoryBytes,
      memoryUsedMB: totalMemoryBytes / (1024 * 1024),
      evictions,
      expirations
    };
  }
  
  /**
   * Get all keys
   */
  function keys(): string[] {
    return Array.from(cache.keys());
  }
  
  /**
   * Get entries by prefix
   */
  function getByPrefix(prefix: string): Map<string, T> {
    const results = new Map<string, T>();
    
    for (const [key, entry] of cache) {
      if (key.startsWith(prefix)) {
        const value = get(key); // This updates access time
        if (value !== null) {
          results.set(key, value);
        }
      }
    }
    
    return results;
  }
  
  /**
   * Remove entries by prefix
   */
  function removeByPrefix(prefix: string): number {
    let removed = 0;
    
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        if (remove(key)) removed++;
      }
    }
    
    return removed;
  }
  
  /**
   * Export cache state for persistence
   */
  function exportState(): Array<{ key: string; entry: CacheEntry<T> }> {
    return Array.from(cache.entries()).map(([key, entry]) => ({
      key,
      entry
    }));
  }
  
  /**
   * Import cache state from persistence
   */
  function importState(
    state: Array<{ key: string; entry: CacheEntry<T> }>
  ): void {
    clear();
    
    const now = Date.now();
    
    for (const { key, entry } of state) {
      // Skip expired entries
      const age = (now - entry.createdAt) / 1000;
      if (age > fullConfig.ttlSeconds) continue;
      
      cache.set(key, entry);
      accessOrder.push(key);
      totalMemoryBytes += entry.sizeBytes;
    }
    
    // Sort access order by lastAccessedAt
    accessOrder.sort((a, b) => {
      const entryA = cache.get(a);
      const entryB = cache.get(b);
      return (entryA?.lastAccessedAt || 0) - (entryB?.lastAccessedAt || 0);
    });
  }
  
  return {
    get,
    set,
    has,
    remove,
    getMany,
    setMany,
    clear,
    cleanup,
    getStats,
    keys,
    getByPrefix,
    removeByPrefix,
    exportState,
    importState
  };
}

// ============================================================================
// TYPED EMBEDDING CACHE
// ============================================================================

/**
 * Create a specialized cache for embeddings with content hashing
 */
export function createContentHashedCache(
  config: Partial<EmbeddingCacheConfig> = {}
) {
  const cache = createEmbeddingCache<number[]>(config);
  
  /**
   * Hash content for cache key
   */
  function hashContent(content: string, model: string): string {
    let hash = 0;
    const str = `${model}:${content}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `emb_${hash.toString(36)}`;
  }
  
  /**
   * Get embedding by content
   */
  function getByContent(content: string, model: string): number[] | null {
    const key = hashContent(content, model);
    return cache.get(key);
  }
  
  /**
   * Set embedding by content
   */
  function setByContent(
    content: string,
    model: string,
    embedding: number[]
  ): void {
    const key = hashContent(content, model);
    cache.set(key, embedding, { content: content.slice(0, 100), model });
  }
  
  /**
   * Check if embedding exists by content
   */
  function hasByContent(content: string, model: string): boolean {
    const key = hashContent(content, model);
    return cache.has(key);
  }
  
  return {
    ...cache,
    getByContent,
    setByContent,
    hasByContent,
    hashContent
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export type EmbeddingCache = ReturnType<typeof createEmbeddingCache>;
export type ContentHashedCache = ReturnType<typeof createContentHashedCache>;
