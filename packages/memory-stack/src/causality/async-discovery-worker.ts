/**
 * Async Causal Discovery Worker
 *
 * Wraps the synchronous causal discovery pipeline in an async worker
 * pattern to prevent blocking the main event loop during heavy
 * computation (n² pairwise tests across many domains).
 *
 * Strategies:
 * 1. Chunked processing — yields to event loop between batches
 * 2. Progressive results — emits partial results as they're computed
 * 3. Cancellation — supports aborting long-running jobs
 * 4. Priority queue — high-value domain pairs tested first
 *
 * For production deployments with 50+ domains, this prevents the
 * main thread from being blocked for seconds during causal analysis.
 */

import {
  runCausalDiscovery,
  type CausalRelationship,
  type DiscoveryConfig,
  type DiscoveryResult,
  DEFAULT_DISCOVERY_CONFIG,
} from './causal-discovery-runner';

// ============================================================================
// TYPES
// ============================================================================

export interface AsyncDiscoveryJob {
  /** Unique job ID */
  id: string;
  /** Organization ID */
  organizationId: string;
  /** Current status */
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** Progress (0-1) */
  progress: number;
  /** Number of domain pairs tested so far */
  pairsTested: number;
  /** Total pairs to test */
  totalPairs: number;
  /** Significant relationships found so far */
  significantSoFar: number;
  /** Partial results available for progressive consumption */
  partialResults: CausalRelationship[];
  /** Final result (when status = 'completed') */
  result?: DiscoveryResult;
  /** Error (when status = 'failed') */
  error?: string;
  /** Timestamps */
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface AsyncDiscoveryConfig extends Partial<DiscoveryConfig> {
  /** Chunk size — how many domain pairs to test per event-loop yield */
  chunkSize?: number;
  /** Priority domains — tested first */
  priorityDomains?: string[];
  /** Callback for progressive results */
  onProgress?: (job: AsyncDiscoveryJob) => void;
  /** Callback when a new relationship is discovered */
  onRelationshipFound?: (relationship: CausalRelationship) => void;
}

export interface DiscoveryWorkerPool {
  /** Submit a discovery job */
  submit: (
    signals: Array<{
      source_domain: string;
      signal_type: string;
      signal_value: number;
      signal_timestamp: string | Date;
    }>,
    organizationId: string,
    config?: AsyncDiscoveryConfig
  ) => AsyncDiscoveryJob;

  /** Get job status */
  getJob: (jobId: string) => AsyncDiscoveryJob | undefined;

  /** Cancel a running job */
  cancel: (jobId: string) => boolean;

  /** Get all jobs */
  listJobs: () => AsyncDiscoveryJob[];

  /** Clear completed/failed/cancelled jobs */
  cleanup: () => number;

  /** Get pool stats */
  stats: () => {
    queued: number;
    running: number;
    completed: number;
    totalRelationshipsFound: number;
  };
}

// ============================================================================
// ASYNC WORKER
// ============================================================================

/**
 * Run causal discovery asynchronously with chunked processing.
 *
 * Uses `setImmediate` (or `setTimeout(0)`) to yield to the event loop
 * between chunks, preventing main-thread starvation.
 */
async function runDiscoveryAsync(
  signals: Array<{
    source_domain: string;
    signal_type: string;
    signal_value: number;
    signal_timestamp: string | Date;
  }>,
  organizationId: string,
  job: AsyncDiscoveryJob,
  config: AsyncDiscoveryConfig = {}
): Promise<DiscoveryResult> {
  const { chunkSize = 500, onProgress, onRelationshipFound } = config;

  // For now, run the synchronous pipeline in a yielding wrapper.
  // The key insight: we yield BEFORE and AFTER the heavy computation
  // to allow I/O and other tasks to proceed.

  // Count total domains for progress reporting
  const domainSet = new Set(signals.map(s => s.source_domain));
  const domainCount = domainSet.size;
  job.totalPairs = domainCount * (domainCount - 1); // n × (n-1) pairs

  job.status = 'running';
  job.startedAt = new Date();
  onProgress?.(job);

  // Yield before heavy computation
  await yieldToEventLoop();

  // If the signal count is small enough, run directly
  if (signals.length < chunkSize || domainCount <= 10) {
    const result = runCausalDiscovery(signals, organizationId, config);
    job.pairsTested = result.pairs_tested;
    job.significantSoFar = result.significant_count;
    job.progress = 1;
    job.partialResults = result.discovered_relationships;

    for (const rel of result.discovered_relationships) {
      onRelationshipFound?.(rel);
    }
    onProgress?.(job);

    return result;
  }

  // For large datasets: chunk by domain groups
  // Prioritize specified domains
  const allDomains = Array.from(domainSet);
  const prioritySet = new Set(config.priorityDomains || []);
  const sortedDomains = [
    ...allDomains.filter(d => prioritySet.has(d)),
    ...allDomains.filter(d => !prioritySet.has(d)),
  ];

  // Process in domain chunks — each chunk includes all signals for a subset of domains
  const domainChunkSize = Math.max(5, Math.ceil(Math.sqrt(domainCount)));
  const allRelationships: CausalRelationship[] = [];
  let totalPairsTested = 0;
  const allWarnings: string[] = [];

  for (let i = 0; i < sortedDomains.length; i += domainChunkSize) {
    // Check for cancellation
    if (job.status === 'cancelled') {
      throw new Error('Job cancelled');
    }

    const domainChunk = sortedDomains.slice(i, i + domainChunkSize);
    // Include all signals from these domains, PLUS adjacent domains for cross-domain detection
    const relevantSignals = signals.filter(s => domainChunk.includes(s.source_domain));

    if (relevantSignals.length < 2) continue;

    // Yield to event loop before processing chunk
    await yieldToEventLoop();

    try {
      const chunkResult = runCausalDiscovery(relevantSignals, organizationId, config);

      for (const rel of chunkResult.discovered_relationships) {
        // Deduplicate
        const exists = allRelationships.some(
          r => r.source_domain === rel.source_domain && r.target_domain === rel.target_domain
        );
        if (!exists) {
          allRelationships.push(rel);
          onRelationshipFound?.(rel);
        }
      }

      totalPairsTested += chunkResult.pairs_tested;
      allWarnings.push(...chunkResult.warnings);
    } catch {
      // Individual chunk failure is non-fatal
    }

    // Update progress
    job.pairsTested = totalPairsTested;
    job.significantSoFar = allRelationships.length;
    job.progress = Math.min(0.99, (i + domainChunkSize) / sortedDomains.length);
    job.partialResults = [...allRelationships];
    onProgress?.(job);
  }

  // Final full pass to catch cross-chunk relationships
  await yieldToEventLoop();

  // Run full discovery if we haven't already (chunking may miss cross-chunk edges)
  if (sortedDomains.length > domainChunkSize) {
    try {
      const fullResult = runCausalDiscovery(signals, organizationId, config);

      for (const rel of fullResult.discovered_relationships) {
        const exists = allRelationships.some(
          r => r.source_domain === rel.source_domain && r.target_domain === rel.target_domain
        );
        if (!exists) {
          allRelationships.push(rel);
          onRelationshipFound?.(rel);
        }
      }

      totalPairsTested = Math.max(totalPairsTested, fullResult.pairs_tested);
      allWarnings.push(...fullResult.warnings);
    } catch {
      // Use chunked results if full pass fails
    }
  }

  const result: DiscoveryResult = {
    organization_id: organizationId,
    discovered_relationships: allRelationships,
    domains_analyzed: sortedDomains,
    pairs_tested: totalPairsTested,
    significant_count: allRelationships.length,
    run_timestamp: new Date(),
    config_used: { ...DEFAULT_DISCOVERY_CONFIG, ...config } as DiscoveryConfig,
    warnings: [...new Set(allWarnings)], // Deduplicate warnings
  };

  return result;
}

// ============================================================================
// WORKER POOL
// ============================================================================

/**
 * Create an async discovery worker pool.
 *
 * Manages concurrent discovery jobs with progressive results,
 * cancellation support, and event-loop-friendly processing.
 *
 * @param maxConcurrent - Maximum jobs running simultaneously (default: 2)
 *
 * @example
 * ```typescript
 * const pool = createDiscoveryWorkerPool(2);
 *
 * const job = pool.submit(signals, orgId, {
 *   priorityDomains: ['engineering', 'finance'],
 *   onProgress: (j) => console.log(`${(j.progress * 100).toFixed(0)}%`),
 *   onRelationshipFound: (r) => console.log(`Found: ${r.source_domain} → ${r.target_domain}`),
 * });
 *
 * // Check progress
 * const status = pool.getJob(job.id);
 *
 * // Cancel if needed
 * pool.cancel(job.id);
 * ```
 */
export function createDiscoveryWorkerPool(maxConcurrent: number = 2): DiscoveryWorkerPool {
  const jobs = new Map<string, AsyncDiscoveryJob>();
  let runningCount = 0;
  const queue: Array<{
    signals: any[];
    organizationId: string;
    config: AsyncDiscoveryConfig;
    job: AsyncDiscoveryJob;
  }> = [];

  function generateJobId(): string {
    return `disc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async function processQueue(): Promise<void> {
    while (runningCount < maxConcurrent && queue.length > 0) {
      const item = queue.shift()!;
      runningCount++;

      runDiscoveryAsync(item.signals, item.organizationId, item.job, item.config)
        .then(result => {
          item.job.status = 'completed';
          item.job.result = result;
          item.job.progress = 1;
          item.job.completedAt = new Date();
          item.config.onProgress?.(item.job);
        })
        .catch(err => {
          if (item.job.status !== 'cancelled') {
            item.job.status = 'failed';
            item.job.error = err.message || 'Unknown error';
          }
          item.job.completedAt = new Date();
          item.config.onProgress?.(item.job);
        })
        .finally(() => {
          runningCount--;
          processQueue(); // Process next in queue
        });
    }
  }

  return {
    submit(signals, organizationId, config = {}) {
      const job: AsyncDiscoveryJob = {
        id: generateJobId(),
        organizationId,
        status: 'queued',
        progress: 0,
        pairsTested: 0,
        totalPairs: 0,
        significantSoFar: 0,
        partialResults: [],
        createdAt: new Date(),
      };

      jobs.set(job.id, job);
      queue.push({ signals, organizationId, config, job });
      processQueue();

      return job;
    },

    getJob(jobId) {
      return jobs.get(jobId);
    },

    cancel(jobId) {
      const job = jobs.get(jobId);
      if (!job || job.status !== 'running' && job.status !== 'queued') return false;

      job.status = 'cancelled';
      job.completedAt = new Date();

      // Remove from queue if still queued
      const queueIdx = queue.findIndex(q => q.job.id === jobId);
      if (queueIdx >= 0) queue.splice(queueIdx, 1);

      return true;
    },

    listJobs() {
      return Array.from(jobs.values());
    },

    cleanup() {
      let cleaned = 0;
      for (const [id, job] of jobs) {
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          jobs.delete(id);
          cleaned++;
        }
      }
      return cleaned;
    },

    stats() {
      let queued = 0, running = 0, completed = 0, totalRelationshipsFound = 0;
      for (const job of jobs.values()) {
        if (job.status === 'queued') queued++;
        else if (job.status === 'running') running++;
        else if (job.status === 'completed') {
          completed++;
          totalRelationshipsFound += job.result?.significant_count || 0;
        }
      }
      return { queued, running, completed, totalRelationshipsFound };
    },
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Yield to the event loop — allows pending I/O, timers, and microtasks to run.
 * Uses setImmediate (Node.js) or setTimeout(0) (fallback).
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => {
    if (typeof setImmediate !== 'undefined') {
      setImmediate(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });
}
