/**
 * Memory Pressure Monitor — Dynamic OOM Prevention
 *
 * Polls process.memoryUsage() and emits pressure levels so callers
 * can adapt in real-time (reduce batch sizes, trigger GC, skip
 * non-essential work) instead of crashing with a static heap limit.
 *
 * Pressure levels:
 *   normal   (<60% heap used)  — full speed
 *   elevated (60-75%)          — reduce batch sizes
 *   high     (75-85%)          — force GC, add delays
 *   critical (>85%)            — emergency mode, skip optional work
 */

// ============================================================================
// TYPES
// ============================================================================

export type PressureLevel = 'normal' | 'elevated' | 'high' | 'critical';

export interface MemoryPressureMonitorConfig {
  /** Polling interval in ms (default: 5000) */
  pollIntervalMs?: number;
  /** Threshold for 'elevated' pressure (default: 0.60) */
  elevatedThreshold?: number;
  /** Threshold for 'high' pressure (default: 0.75) */
  highThreshold?: number;
  /** Threshold for 'critical' pressure (default: 0.85) */
  criticalThreshold?: number;
  /** Log pressure changes to console (default: true) */
  verbose?: boolean;
}

export interface MemorySnapshot {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  usageRatio: number;
  level: PressureLevel;
  timestamp: number;
}

export interface MemoryStats {
  peakHeapUsedMB: number;
  avgHeapUsedMB: number;
  peakRssMB: number;
  samples: number;
  timeInNormalMs: number;
  timeInElevatedMs: number;
  timeInHighMs: number;
  timeInCriticalMs: number;
  gcTriggered: number;
  batchReductions: number;
}

type PressureCallback = (snapshot: MemorySnapshot) => void;

export interface MemoryPressureMonitor {
  /** Start polling */
  start(): void;
  /** Stop polling and return final stats */
  stop(): MemoryStats;
  /** Get current pressure level */
  getLevel(): PressureLevel;
  /** Get current memory snapshot */
  getSnapshot(): MemorySnapshot;
  /** Get accumulated stats */
  getStats(): MemoryStats;
  /** Register callback for a pressure level (fires on transition TO that level or higher) */
  onPressure(level: PressureLevel, callback: PressureCallback): void;
  /** Try to trigger GC if --expose-gc is enabled */
  tryGC(): boolean;
  /** Compute recommended batch size given a base size */
  recommendBatchSize(baseBatchSize: number): number;
  /** Compute recommended delay between batches in ms */
  recommendBatchDelay(baseDelayMs: number): number;
  /** Whether we're in emergency mode (critical pressure) */
  isEmergency(): boolean;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

const MB = 1024 * 1024;

function computeLevel(
  ratio: number,
  elevated: number,
  high: number,
  critical: number,
): PressureLevel {
  if (ratio >= critical) return 'critical';
  if (ratio >= high) return 'high';
  if (ratio >= elevated) return 'elevated';
  return 'normal';
}

export function createMemoryPressureMonitor(
  config: MemoryPressureMonitorConfig = {},
): MemoryPressureMonitor {
  const {
    pollIntervalMs = 5_000,
    elevatedThreshold = 0.60,
    highThreshold = 0.75,
    criticalThreshold = 0.85,
    verbose = true,
  } = config;

  let timer: ReturnType<typeof setInterval> | null = null;
  let currentLevel: PressureLevel = 'normal';
  let peakHeapUsed = 0;
  let peakRss = 0;
  let heapSum = 0;
  let sampleCount = 0;
  let gcTriggered = 0;
  let batchReductions = 0;
  let lastSampleTime = Date.now();

  const timeInLevel: Record<PressureLevel, number> = {
    normal: 0,
    elevated: 0,
    high: 0,
    critical: 0,
  };

  const callbacks: Map<PressureLevel, PressureCallback[]> = new Map([
    ['normal', []],
    ['elevated', []],
    ['high', []],
    ['critical', []],
  ]);

  const LEVEL_PRIORITY: Record<PressureLevel, number> = {
    normal: 0,
    elevated: 1,
    high: 2,
    critical: 3,
  };

  function takeSnapshot(): MemorySnapshot {
    const mem = process.memoryUsage();
    const heapUsedMB = mem.heapUsed / MB;
    const heapTotalMB = mem.heapTotal / MB;
    const rssMB = mem.rss / MB;
    const externalMB = mem.external / MB;
    const usageRatio = heapTotalMB > 0 ? heapUsedMB / heapTotalMB : 0;
    const level = computeLevel(usageRatio, elevatedThreshold, highThreshold, criticalThreshold);

    return { heapUsedMB, heapTotalMB, rssMB, externalMB, usageRatio, level, timestamp: Date.now() };
  }

  function poll(): void {
    const now = Date.now();
    const elapsed = now - lastSampleTime;
    lastSampleTime = now;

    // Accumulate time in previous level
    timeInLevel[currentLevel] += elapsed;

    const snapshot = takeSnapshot();
    sampleCount++;
    heapSum += snapshot.heapUsedMB;

    if (snapshot.heapUsedMB > peakHeapUsed) peakHeapUsed = snapshot.heapUsedMB;
    if (snapshot.rssMB > peakRss) peakRss = snapshot.rssMB;

    const previousLevel = currentLevel;
    currentLevel = snapshot.level;

    // Fire callbacks on level transition (upward only — don't spam on recovery)
    if (LEVEL_PRIORITY[currentLevel] > LEVEL_PRIORITY[previousLevel]) {
      if (verbose) {
        const time = new Date().toISOString().substring(11, 19);
        console.log(
          `[${time}] [MEMORY] Pressure: ${previousLevel} → ${currentLevel} ` +
          `(${snapshot.heapUsedMB.toFixed(0)}MB / ${snapshot.heapTotalMB.toFixed(0)}MB = ${(snapshot.usageRatio * 100).toFixed(1)}%)`
        );
      }

      // Fire callbacks for current level and all levels below it
      for (const [level, cbs] of callbacks) {
        if (LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[currentLevel]) {
          for (const cb of cbs) {
            try { cb(snapshot); } catch { /* don't let callback errors crash monitor */ }
          }
        }
      }
    }
  }

  return {
    start() {
      if (timer) return;
      lastSampleTime = Date.now();
      // Take initial snapshot immediately
      poll();
      timer = setInterval(poll, pollIntervalMs);
      // Ensure timer doesn't prevent process exit
      if (timer && typeof timer === 'object' && 'unref' in timer) {
        timer.unref();
      }
      if (verbose) {
        const time = new Date().toISOString().substring(11, 19);
        const snapshot = takeSnapshot();
        console.log(
          `[${time}] [MEMORY] Monitor started — ` +
          `heap: ${snapshot.heapUsedMB.toFixed(0)}MB / ${snapshot.heapTotalMB.toFixed(0)}MB, ` +
          `polling every ${pollIntervalMs / 1000}s`
        );
      }
    },

    stop(): MemoryStats {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      // Final sample
      const elapsed = Date.now() - lastSampleTime;
      timeInLevel[currentLevel] += elapsed;

      const stats = this.getStats();
      if (verbose) {
        const time = new Date().toISOString().substring(11, 19);
        console.log(
          `[${time}] [MEMORY] Monitor stopped — ` +
          `peak: ${stats.peakHeapUsedMB.toFixed(0)}MB, ` +
          `avg: ${stats.avgHeapUsedMB.toFixed(0)}MB, ` +
          `GC triggered: ${stats.gcTriggered}, ` +
          `batch reductions: ${stats.batchReductions}`
        );
      }
      return stats;
    },

    getLevel(): PressureLevel {
      return currentLevel;
    },

    getSnapshot(): MemorySnapshot {
      return takeSnapshot();
    },

    getStats(): MemoryStats {
      return {
        peakHeapUsedMB: peakHeapUsed,
        avgHeapUsedMB: sampleCount > 0 ? heapSum / sampleCount : 0,
        peakRssMB: peakRss,
        samples: sampleCount,
        timeInNormalMs: timeInLevel.normal,
        timeInElevatedMs: timeInLevel.elevated,
        timeInHighMs: timeInLevel.high,
        timeInCriticalMs: timeInLevel.critical,
        gcTriggered,
        batchReductions,
      };
    },

    onPressure(level: PressureLevel, callback: PressureCallback): void {
      callbacks.get(level)?.push(callback);
    },

    tryGC(): boolean {
      if (typeof globalThis.gc === 'function') {
        globalThis.gc();
        gcTriggered++;
        return true;
      }
      return false;
    },

    recommendBatchSize(baseBatchSize: number): number {
      const snapshot = takeSnapshot();
      let size = baseBatchSize;

      if (snapshot.level === 'elevated') {
        size = Math.max(100, Math.floor(baseBatchSize * 0.5));
        batchReductions++;
      } else if (snapshot.level === 'high') {
        size = Math.max(50, Math.floor(baseBatchSize * 0.25));
        batchReductions++;
      } else if (snapshot.level === 'critical') {
        size = Math.max(25, Math.floor(baseBatchSize * 0.1));
        batchReductions++;
      }

      return size;
    },

    recommendBatchDelay(baseDelayMs: number): number {
      const snapshot = takeSnapshot();
      if (snapshot.level === 'critical') return Math.max(baseDelayMs, 1000);
      if (snapshot.level === 'high') return Math.max(baseDelayMs, 500);
      if (snapshot.level === 'elevated') return Math.max(baseDelayMs, 100);
      return baseDelayMs;
    },

    isEmergency(): boolean {
      return currentLevel === 'critical';
    },
  };
}
