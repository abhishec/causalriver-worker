/**
 * Anomaly Monitor
 *
 * Subscribes to 'signal' events on the event bus.
 * Maintains rolling windows per org:domain and runs
 * anomaly detection on each new value.
 * Emits 'cascade_trigger' events when anomalies are detected.
 */

import type { CausalEvent } from '../causality/event-bus';
import { generateEventId } from '../causality/event-bus';
import {
  computeStatistics,
  zScoreDetection,
  iqrDetection,
  madDetection,
  type DetectionMethod,
} from '../learning/anomaly-detector';

type EventBusInstance = {
  emit: (event: any) => boolean;
  subscribe: (options: {
    filter: any;
    handler: (events: CausalEvent[]) => Promise<void>;
  }) => string;
};

export interface DetectedAnomaly {
  organizationId: string;
  domain: string;
  signalType: string;
  signalValue: number;
  deviationSigma: number;
  historicalMean: number;
  historicalStd: number;
  method: DetectionMethod;
  priority: 1 | 2 | 3;
  /** Plain-English title for the activity feed */
  feedTitle: string;
  /** Plain-English description for the activity feed */
  feedDescription: string;
}

export interface AnomalyMonitorConfig {
  /** Rolling window size in data points (default: 90) */
  windowSize: number;
  /** Minimum window size before detection (default: 30) */
  minWindowSize: number;
  /** Detection method (default: 'zscore') */
  method: DetectionMethod;
  /** Detection threshold (default: 2.5 for zscore) */
  threshold: number;
  /**
   * Called whenever an anomaly is detected. Use this to persist to
   * platform_events or any other notification system.
   * Fire-and-forget — errors are caught and logged.
   */
  onAnomaly?: (anomaly: DetectedAnomaly) => Promise<void>;
}

const DEFAULT_CONFIG: AnomalyMonitorConfig = {
  windowSize: 90,
  minWindowSize: 30,
  method: 'zscore',
  threshold: 2.5,
};

/**
 * Create an anomaly monitor that watches for unusual signals
 */
export function createAnomalyMonitor(
  eventBus: EventBusInstance,
  config: Partial<AnomalyMonitorConfig> = {}
) {
  const { windowSize, minWindowSize, method, threshold, onAnomaly } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Rolling windows: key = "orgId:domain"
  const windows = new Map<string, number[]>();
  let totalAnomaliesDetected = 0;

  const subscriptionId = eventBus.subscribe({
    filter: { eventTypes: ['signal'] as any },
    handler: async (events: CausalEvent[]) => {
      for (const event of events) {
        const key = `${event.organizationId}:${event.domain}`;

        if (!windows.has(key)) {
          windows.set(key, []);
        }

        const window = windows.get(key)!;
        const signalValue = (event.payload.signal_value as number) || 0;
        window.push(signalValue);

        // Trim to window size
        if (window.length > windowSize) {
          window.shift();
        }

        // Check for anomalies when we have enough data
        if (window.length >= minWindowSize) {
          const stats = computeStatistics(window);

          // Run detection on the latest value
          const detection =
            method === 'iqr'
              ? iqrDetection(signalValue, stats, threshold)
              : method === 'mad'
                ? madDetection(signalValue, stats, threshold)
                : zScoreDetection(signalValue, stats, threshold);

          if (detection.isAnomaly) {
            totalAnomaliesDetected++;

            const deviation = Math.abs(detection.zScore);
            const priority: 1 | 2 | 3 = deviation > 3 ? 1 : deviation > 2.5 ? 2 : 3;
            const signalType = (event.payload.signal_type as string) || event.domain;

            // Emit cascade trigger
            eventBus.emit({
              eventId: generateEventId('anom'),
              organizationId: event.organizationId,
              domain: event.domain,
              entityType: event.entityType,
              entityId: event.entityId,
              clientId: event.clientId,
              eventType: 'cascade_trigger' as any,
              payload: {
                anomaly_score: deviation,
                signal_value: signalValue,
                method,
                threshold,
                historical_mean: stats.mean,
                historical_std: stats.std,
                window_size: window.length,
                trigger_event_id: event.eventId,
                signal_type: signalType,
              },
              timestamp: new Date(),
              priority,
            });

            // Build plain-English feed message (what an accountant actually cares about)
            const sigLabel = signalType.replace(/_/g, ' ');
            const domainLabel = event.domain.replace(/_/g, ' ');
            const multiplier = stats.mean > 0
              ? (signalValue / stats.mean).toFixed(1)
              : null;
            const direction = signalValue > stats.mean ? 'higher' : 'lower';
            const severityWord = priority === 1 ? 'significantly' : priority === 2 ? 'notably' : 'slightly';

            const feedTitle = multiplier
              ? `Your ${sigLabel} is ${multiplier}× your usual — ${severityWord} ${direction} than normal`
              : `Unusual ${sigLabel} detected in ${domainLabel} — ${deviation.toFixed(1)}σ from baseline`;

            const feedDescription = `Current value: ${signalValue.toLocaleString()}. Your usual range: around ${stats.mean.toLocaleString()} (±${stats.std.toFixed(0)}). Last time this happened, check your cash position within the next few weeks.`;

            // Notify via callback (platform layer wires this to platform_events)
            if (onAnomaly) {
              onAnomaly({
                organizationId: event.organizationId,
                domain: event.domain,
                signalType,
                signalValue,
                deviationSigma: deviation,
                historicalMean: stats.mean,
                historicalStd: stats.std,
                method,
                priority,
                feedTitle,
                feedDescription,
              }).catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn('[AnomalyMonitor] onAnomaly callback failed:', msg);
              });
            }
          }
        }
      }
    },
  });

  return {
    subscriptionId,
    getStats() {
      return {
        totalAnomaliesDetected,
        windowsTracked: windows.size,
        windows: Object.fromEntries(
          Array.from(windows.entries()).map(([k, v]) => [k, v.length])
        ),
      };
    },
    /** Clear monitoring windows */
    reset() {
      windows.clear();
      totalAnomaliesDetected = 0;
    },
  };
}
