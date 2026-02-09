/**
 * Nexus Observability — Metrics Collector
 *
 * Lightweight in-process metrics collection for monitoring
 * the NexusBrain memory stack in production.
 *
 * Metric types:
 * - Counter: monotonically increasing values (e.g., signals_ingested)
 * - Gauge: point-in-time values (e.g., active_entities)
 * - Histogram: distribution of values (e.g., query_latency_ms)
 * - Timer: convenience wrapper for measuring durations
 *
 * Zero external dependencies. Export to Prometheus, DataDog, etc.
 * via the `snapshot()` method.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface MetricLabels {
  [key: string]: string;
}

export interface CounterMetric {
  type: 'counter';
  name: string;
  description: string;
  value: number;
  labels: MetricLabels;
}

export interface GaugeMetric {
  type: 'gauge';
  name: string;
  description: string;
  value: number;
  labels: MetricLabels;
}

export interface HistogramMetric {
  type: 'histogram';
  name: string;
  description: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  labels: MetricLabels;
}

export type Metric = CounterMetric | GaugeMetric | HistogramMetric;

export interface MetricsSnapshot {
  timestamp: string;
  uptime_ms: number;
  metrics: Metric[];
}

export interface NexusMetrics {
  /** Increment a counter */
  increment(name: string, value?: number, labels?: MetricLabels): void;

  /** Set a gauge value */
  gauge(name: string, value: number, labels?: MetricLabels): void;

  /** Record a histogram observation */
  observe(name: string, value: number, labels?: MetricLabels): void;

  /** Start a timer, returns a function that stops and records the duration */
  startTimer(name: string, labels?: MetricLabels): () => number;

  /** Get a snapshot of all metrics */
  snapshot(): MetricsSnapshot;

  /** Reset all metrics */
  reset(): void;

  /** Get a specific counter value */
  getCounter(name: string, labels?: MetricLabels): number;

  /** Get a specific gauge value */
  getGauge(name: string, labels?: MetricLabels): number;

  /** Get histogram stats */
  getHistogram(name: string, labels?: MetricLabels): HistogramMetric | null;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

interface InternalCounter {
  description: string;
  values: Map<string, number>; // key = serialized labels
}

interface InternalGauge {
  description: string;
  values: Map<string, number>;
}

interface InternalHistogram {
  description: string;
  observations: Map<string, number[]>;
}

function serializeLabels(labels: MetricLabels = {}): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '';
  return keys.map(k => `${k}=${labels[k]}`).join(',');
}

function deserializeLabels(key: string): MetricLabels {
  if (!key) return {};
  const labels: MetricLabels = {};
  for (const pair of key.split(',')) {
    const [k, v] = pair.split('=');
    labels[k] = v;
  }
  return labels;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

/**
 * Create a metrics collector for NexusBrain.
 *
 * @example
 * ```typescript
 * const metrics = createMetrics();
 *
 * // Count signals ingested
 * metrics.increment('nexus.signals.ingested', 5, { domain: 'engineering' });
 *
 * // Track active entity count
 * metrics.gauge('nexus.entities.active', 142);
 *
 * // Measure query latency
 * const stopTimer = metrics.startTimer('nexus.query.latency_ms');
 * const result = await brain.query('...');
 * stopTimer();
 *
 * // Get snapshot for export
 * const snap = metrics.snapshot();
 * console.log(JSON.stringify(snap, null, 2));
 * ```
 */
export function createMetrics(): NexusMetrics {
  const counters = new Map<string, InternalCounter>();
  const gauges = new Map<string, InternalGauge>();
  const histograms = new Map<string, InternalHistogram>();
  const startTime = Date.now();

  // Pre-register common NexusBrain metrics
  const METRIC_DESCRIPTIONS: Record<string, string> = {
    'nexus.signals.ingested': 'Total signals ingested across all domains',
    'nexus.signals.ingested.errors': 'Signal ingestion errors',
    'nexus.queries.total': 'Total queries processed',
    'nexus.queries.latency_ms': 'Query latency in milliseconds',
    'nexus.causal.discoveries': 'Causal relationships discovered',
    'nexus.causal.discovery_duration_ms': 'Causal discovery duration',
    'nexus.patterns.detected': 'Patterns detected',
    'nexus.patterns.promoted': 'Patterns promoted to rules',
    'nexus.anomalies.detected': 'Anomalies detected',
    'nexus.memories.created': 'Memories created',
    'nexus.memories.decayed': 'Memories pruned by decay',
    'nexus.memories.consolidated': 'Memories consolidated (merged duplicates)',
    'nexus.embeddings.generated': 'Embeddings generated',
    'nexus.embeddings.neural_calls': 'Neural embedding API calls',
    'nexus.embeddings.neural_fallbacks': 'Neural embedding fallbacks to n-gram',
    'nexus.embeddings.latency_ms': 'Embedding generation latency',
    'nexus.entities.resolved': 'Entities resolved (entity resolution)',
    'nexus.entities.active': 'Currently active entities',
    'nexus.learning_cycles.total': 'Total learning cycles executed',
    'nexus.learning_cycles.duration_ms': 'Learning cycle duration',
    'nexus.federation.requests': 'Knowledge federation requests',
    'nexus.federation.core_hits': 'Core brain knowledge hits',
  };

  function getDescription(name: string): string {
    return METRIC_DESCRIPTIONS[name] || name;
  }

  function ensureCounter(name: string): InternalCounter {
    if (!counters.has(name)) {
      counters.set(name, { description: getDescription(name), values: new Map() });
    }
    return counters.get(name)!;
  }

  function ensureGauge(name: string): InternalGauge {
    if (!gauges.has(name)) {
      gauges.set(name, { description: getDescription(name), values: new Map() });
    }
    return gauges.get(name)!;
  }

  function ensureHistogram(name: string): InternalHistogram {
    if (!histograms.has(name)) {
      histograms.set(name, { description: getDescription(name), observations: new Map() });
    }
    return histograms.get(name)!;
  }

  return {
    increment(name, value = 1, labels = {}) {
      const counter = ensureCounter(name);
      const key = serializeLabels(labels);
      counter.values.set(key, (counter.values.get(key) || 0) + value);
    },

    gauge(name, value, labels = {}) {
      const gauge = ensureGauge(name);
      const key = serializeLabels(labels);
      gauge.values.set(key, value);
    },

    observe(name, value, labels = {}) {
      const hist = ensureHistogram(name);
      const key = serializeLabels(labels);
      const arr = hist.observations.get(key) || [];
      arr.push(value);
      // Keep last 10000 observations per label set
      if (arr.length > 10000) arr.shift();
      hist.observations.set(key, arr);
    },

    startTimer(name, labels = {}) {
      const start = performance.now();
      return () => {
        const elapsed = performance.now() - start;
        this.observe(name, elapsed, labels);
        return elapsed;
      };
    },

    getCounter(name, labels = {}) {
      const counter = counters.get(name);
      if (!counter) return 0;
      return counter.values.get(serializeLabels(labels)) || 0;
    },

    getGauge(name, labels = {}) {
      const gauge = gauges.get(name);
      if (!gauge) return 0;
      return gauge.values.get(serializeLabels(labels)) || 0;
    },

    getHistogram(name, labels = {}) {
      const hist = histograms.get(name);
      if (!hist) return null;
      const key = serializeLabels(labels);
      const obs = hist.observations.get(key);
      if (!obs || obs.length === 0) return null;

      const sorted = [...obs].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);

      return {
        type: 'histogram' as const,
        name,
        description: hist.description,
        count: sorted.length,
        sum,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: sum / sorted.length,
        p50: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
        labels: deserializeLabels(key),
      };
    },

    snapshot() {
      const metrics: Metric[] = [];

      // Counters
      for (const [name, counter] of counters) {
        for (const [key, value] of counter.values) {
          metrics.push({
            type: 'counter',
            name,
            description: counter.description,
            value,
            labels: deserializeLabels(key),
          });
        }
      }

      // Gauges
      for (const [name, gauge] of gauges) {
        for (const [key, value] of gauge.values) {
          metrics.push({
            type: 'gauge',
            name,
            description: gauge.description,
            value,
            labels: deserializeLabels(key),
          });
        }
      }

      // Histograms
      for (const [name, hist] of histograms) {
        for (const [key, obs] of hist.observations) {
          if (obs.length === 0) continue;
          const sorted = [...obs].sort((a, b) => a - b);
          const sum = sorted.reduce((a, b) => a + b, 0);

          metrics.push({
            type: 'histogram',
            name,
            description: hist.description,
            count: sorted.length,
            sum,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: sum / sorted.length,
            p50: percentile(sorted, 0.5),
            p90: percentile(sorted, 0.9),
            p95: percentile(sorted, 0.95),
            p99: percentile(sorted, 0.99),
            labels: deserializeLabels(key),
          });
        }
      }

      return {
        timestamp: new Date().toISOString(),
        uptime_ms: Date.now() - startTime,
        metrics,
      };
    },

    reset() {
      counters.clear();
      gauges.clear();
      histograms.clear();
    },
  };
}

// ============================================================================
// SINGLETON
// ============================================================================

let _defaultMetrics: NexusMetrics | null = null;

/**
 * Get or create the default metrics singleton.
 */
export function getDefaultMetrics(): NexusMetrics {
  if (!_defaultMetrics) {
    _defaultMetrics = createMetrics();
  }
  return _defaultMetrics;
}
