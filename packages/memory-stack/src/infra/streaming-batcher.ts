/**
 * Streaming Micro-Batcher — Pagination without OOM
 *
 * Fixes Bottleneck #4: No pagination (loads all rows → OOM)
 *
 * Instead of loading all signals into memory:
 *   Old: SELECT * FROM signals WHERE org_id = ? → 10M rows → OOM
 *   New: Stream in micro-batches of 100-1000, process, release
 *
 * Features:
 * - Cursor-based streaming (no OFFSET)
 * - Configurable batch size
 * - Backpressure-aware (waits for batch processing before fetching next)
 * - Memory-bounded (only 1 batch in memory at a time)
 * - Works with any async iterable data source
 */

import { getDefaultLogger, type NexusLogger } from '../observability';

// ============================================================================
// TYPES
// ============================================================================

export interface StreamingBatcherConfig {
  /** Batch size (default: 100) */
  batchSize?: number;
  /** Max total items to process (default: Infinity) */
  maxItems?: number;
  /** Delay between batches in ms (default: 0) */
  batchDelayMs?: number;
  /** Timeout per batch in ms (default: 30000) */
  batchTimeoutMs?: number;
  /** Logger */
  logger?: NexusLogger;
  /**
   * Enable adaptive batch sizing based on memory pressure.
   * When enabled, batch size and delay auto-scale based on heap usage:
   *   >70% heap: halve batch size (min: 100)
   *   <40% heap: double batch size (up to original)
   *   >75% heap: add 500ms delay between batches
   * (default: false)
   */
  adaptiveBatchSize?: boolean;
}

export interface BatchResult<T> {
  items: T[];
  batchNumber: number;
  totalProcessed: number;
  hasMore: boolean;
  cursor: string | null;
}

export interface StreamingStats {
  totalItems: number;
  totalBatches: number;
  avgBatchSize: number;
  avgBatchTimeMs: number;
  totalTimeMs: number;
  peakMemoryUsage: number;
}

export type DataFetcher<T> = (cursor: string | null, batchSize: number) => Promise<{
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}>;

export type BatchProcessor<T, R = void> = (batch: T[], batchNumber: number) => Promise<R>;

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Stream data in micro-batches with backpressure control
 *
 * @example
 * ```typescript
 * const stats = await streamInBatches(
 *   // Fetch function with cursor
 *   async (cursor, batchSize) => {
 *     const { data } = await supabase
 *       .from('signals')
 *       .select('*')
 *       .eq('organization_id', orgId)
 *       .gt('id', cursor ?? '')
 *       .order('id', { ascending: true })
 *       .limit(batchSize);
 *     return {
 *       items: data ?? [],
 *       nextCursor: data?.length ? data[data.length - 1].id : null,
 *       hasMore: (data?.length ?? 0) === batchSize,
 *     };
 *   },
 *   // Process each batch
 *   async (batch, batchNumber) => {
 *     await processSignals(batch);
 *   },
 *   { batchSize: 500, maxItems: 100_000 }
 * );
 * ```
 */
export async function streamInBatches<T, R = void>(
  fetcher: DataFetcher<T>,
  processor: BatchProcessor<T, R>,
  config: StreamingBatcherConfig = {},
): Promise<StreamingStats> {
  const {
    batchSize = 100,
    maxItems = Infinity,
    batchDelayMs = 0,
    batchTimeoutMs = 30_000,
    adaptiveBatchSize = false,
  } = config;

  const logger = config.logger ?? getDefaultLogger().child({ module: 'streaming-batcher' });

  let cursor: string | null = null;
  let totalProcessed = 0;
  let batchNumber = 0;
  let totalBatchTimeMs = 0;
  const startTime = Date.now();
  let peakMemory = 0;
  let currentBatchSize = batchSize;

  while (totalProcessed < maxItems) {
    const batchStart = Date.now();

    // Adaptive batch sizing: adjust based on current heap pressure
    if (adaptiveBatchSize) {
      const mem = process.memoryUsage();
      const heapRatio = mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0;

      if (heapRatio > 0.70) {
        // Under pressure — halve batch size (floor: 100)
        currentBatchSize = Math.max(100, Math.floor(currentBatchSize / 2));
      } else if (heapRatio < 0.40 && currentBatchSize < batchSize) {
        // Plenty of room — grow back toward original
        currentBatchSize = Math.min(batchSize, currentBatchSize * 2);
      }
    }

    // Fetch batch
    const effectiveBatchSize = Math.min(currentBatchSize, maxItems - totalProcessed);
    const { items, nextCursor, hasMore } = await fetcher(cursor, effectiveBatchSize);

    if (items.length === 0) break;

    batchNumber++;

    // Track memory
    const memUsage = process.memoryUsage().heapUsed;
    if (memUsage > peakMemory) peakMemory = memUsage;

    // Process batch with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Batch ${batchNumber} timeout after ${batchTimeoutMs}ms`)), batchTimeoutMs);
    });

    try {
      await Promise.race([
        processor(items, batchNumber),
        timeoutPromise,
      ]);
    } catch (err) {
      logger.error('Batch processing error', {
        batchNumber,
        error: err instanceof Error ? err.message : String(err),
        itemCount: items.length,
      });
      throw err;
    }

    totalProcessed += items.length;
    cursor = nextCursor;
    totalBatchTimeMs += Date.now() - batchStart;

    logger.debug('Batch processed', {
      batchNumber,
      batchSize: items.length,
      totalProcessed,
      hasMore,
      ...(adaptiveBatchSize ? { adaptedBatchSize: currentBatchSize } : {}),
    });

    if (!hasMore) break;

    // Backpressure delay (adaptive: increase under memory pressure)
    let effectiveDelay = batchDelayMs;
    if (adaptiveBatchSize) {
      const mem = process.memoryUsage();
      const heapRatio = mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0;
      if (heapRatio > 0.75) effectiveDelay = Math.max(effectiveDelay, 500);
      else if (heapRatio > 0.60) effectiveDelay = Math.max(effectiveDelay, 100);
    }
    if (effectiveDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, effectiveDelay));
    }
  }

  const stats: StreamingStats = {
    totalItems: totalProcessed,
    totalBatches: batchNumber,
    avgBatchSize: batchNumber > 0 ? totalProcessed / batchNumber : 0,
    avgBatchTimeMs: batchNumber > 0 ? totalBatchTimeMs / batchNumber : 0,
    totalTimeMs: Date.now() - startTime,
    peakMemoryUsage: peakMemory,
  };

  logger.info('Streaming complete', { totalItems: stats.totalItems, totalBatches: stats.totalBatches, totalTimeMs: stats.totalTimeMs });
  return stats;
}

/**
 * Create an async iterator from a data fetcher for streaming
 */
export async function* createBatchIterator<T>(
  fetcher: DataFetcher<T>,
  batchSize = 100,
): AsyncGenerator<BatchResult<T>> {
  let cursor: string | null = null;
  let totalProcessed = 0;
  let batchNumber = 0;

  while (true) {
    const { items, nextCursor, hasMore } = await fetcher(cursor, batchSize);
    if (items.length === 0) break;

    batchNumber++;
    totalProcessed += items.length;
    cursor = nextCursor;

    yield {
      items,
      batchNumber,
      totalProcessed,
      hasMore,
      cursor: nextCursor,
    };

    if (!hasMore) break;
  }
}

/**
 * Parallel batch processor — processes N batches concurrently
 */
export async function streamInParallelBatches<T, R = void>(
  fetcher: DataFetcher<T>,
  processor: BatchProcessor<T, R>,
  config: StreamingBatcherConfig & { parallelism?: number } = {},
): Promise<StreamingStats> {
  const { parallelism = 3 } = config;
  const logger = config.logger ?? getDefaultLogger().child({ module: 'parallel-batcher' });

  // Pre-fetch batches
  const batches: T[][] = [];
  let cursor: string | null = null;
  const batchSize = config.batchSize ?? 100;
  const maxItems = config.maxItems ?? Infinity;
  let totalFetched = 0;

  // Fetch all needed batches
  while (totalFetched < maxItems) {
    const effectiveBatchSize = Math.min(batchSize, maxItems - totalFetched);
    const { items, nextCursor, hasMore } = await fetcher(cursor, effectiveBatchSize);
    if (items.length === 0) break;

    batches.push(items);
    totalFetched += items.length;
    cursor = nextCursor;

    if (!hasMore) break;
  }

  // Process in parallel chunks
  const startTime = Date.now();
  let totalProcessed = 0;

  for (let i = 0; i < batches.length; i += parallelism) {
    const chunk = batches.slice(i, i + parallelism);
    await Promise.all(
      chunk.map((batch, j) => processor(batch, i + j + 1))
    );
    totalProcessed += chunk.reduce((sum, b) => sum + b.length, 0);
  }

  const stats: StreamingStats = {
    totalItems: totalProcessed,
    totalBatches: batches.length,
    avgBatchSize: batches.length > 0 ? totalProcessed / batches.length : 0,
    avgBatchTimeMs: batches.length > 0 ? (Date.now() - startTime) / batches.length : 0,
    totalTimeMs: Date.now() - startTime,
    peakMemoryUsage: process.memoryUsage().heapUsed,
  };

  logger.info('Parallel streaming complete', { ...stats, parallelism });
  return stats;
}
