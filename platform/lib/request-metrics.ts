/**
 * Request Metrics — In-Memory Rolling Window
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Module-level rolling window that tracks request durations for all paths
 * processed by Next.js middleware. Resets on Lambda cold start (acceptable
 * for operational monitoring — not intended as persistent storage).
 *
 * Populated by middleware.ts on every request (not just slow ones).
 * Consumed by GET /api/brain/metrics for percentile reporting.
 *
 * Design constraints:
 *   - Max 1000 entries to bound memory usage (~160 KB per entry worst-case)
 *   - Oldest entries evicted when window is full (FIFO)
 *   - Thread-safe for Node.js single-threaded event loop (no locks needed)
 */

export interface RequestRecord {
  path: string;
  durationMs: number;
  ts: number; // Unix ms timestamp
}

/** Rolling window — module-level singleton, survives across requests in the same Lambda instance */
export const _requestTimes: Array<RequestRecord> = [];

const WINDOW_SIZE = 1000;

/**
 * Record a completed request's duration.
 * Called from middleware.ts for every request so the metrics window
 * captures the full distribution, not just slow requests.
 */
export function recordRequestTime(path: string, durationMs: number): void {
  _requestTimes.push({ path, durationMs, ts: Date.now() });
  // Evict oldest entry when window is full — O(n) but window is small
  if (_requestTimes.length > WINDOW_SIZE) {
    _requestTimes.shift();
  }
}

// ── Percentile helpers ──────────────────────────────────────────────────────

/**
 * Compute percentile value from a sorted array of numbers.
 * Uses nearest-rank method (no interpolation) for simplicity.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export interface RouteStats {
  path: string;
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

/**
 * Compute per-route statistics from the rolling window.
 * Returns routes sorted by p95 descending (slowest first).
 *
 * @param windowMs - Only consider entries from the last N milliseconds (default: 24h)
 */
export function computeRouteStats(windowMs = 24 * 60 * 60 * 1000): RouteStats[] {
  const cutoff = Date.now() - windowMs;
  const recent = _requestTimes.filter((r) => r.ts >= cutoff);

  // Group by path
  const byPath = new Map<string, number[]>();
  for (const record of recent) {
    const existing = byPath.get(record.path) ?? [];
    existing.push(record.durationMs);
    byPath.set(record.path, existing);
  }

  const stats: RouteStats[] = [];
  for (const [path, durations] of byPath.entries()) {
    const sorted = [...durations].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    stats.push({
      path,
      count: sorted.length,
      avgMs: Math.round(sum / sorted.length),
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
      maxMs: sorted[sorted.length - 1] ?? 0,
    });
  }

  // Sort by p95 descending — surfaces the slowest routes first
  stats.sort((a, b) => b.p95Ms - a.p95Ms);
  return stats;
}
