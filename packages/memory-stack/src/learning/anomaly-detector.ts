/**
 * Anomaly Detector
 * 
 * Statistical anomaly detection using multiple methods:
 * - Z-Score: Standard deviation from mean
 * - IQR: Interquartile range (robust to outliers)
 * - MAD: Median Absolute Deviation (very robust)
 * 
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Detection method to use
 */
export type DetectionMethod = 'zscore' | 'iqr' | 'mad' | 'ensemble' | 'auto';

/**
 * An anomaly event
 */
export interface AnomalyEvent {
  /** Entity type (e.g., 'client', 'invoice') */
  entityType: string;
  /** Entity identifier */
  entityId: string;
  /** Metric that is anomalous */
  metricName: string;
  /** Observed value */
  observedValue: number;
  /** Expected value (mean or median) */
  expectedValue: number;
  /** How many standard deviations from expected */
  zScore: number;
  /** Detection method used */
  detectionMethod: DetectionMethod;
  /** Human-readable explanation */
  explanation: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** When the anomaly was detected */
  detectedAt: Date;
  /** Percentile of this observation */
  percentile: number;
}

/**
 * Configuration for anomaly detection
 */
export interface AnomalyConfig {
  /** Detection method */
  method: DetectionMethod;
  /** Z-score threshold for zscore method (default 3) */
  zScoreThreshold?: number;
  /** IQR multiplier for IQR method (default 1.5) */
  iqrMultiplier?: number;
  /** MAD multiplier for MAD method (default 3) */
  madMultiplier?: number;
  /** Minimum sample size for detection (default 10) */
  minSampleSize?: number;
}

/**
 * Statistics about a metric
 */
export interface MetricStatistics {
  mean: number;
  median: number;
  std: number;
  mad: number;
  q1: number;
  q3: number;
  iqr: number;
  min: number;
  max: number;
  count: number;
}

// ============================================================================
// STATISTICAL HELPERS
// ============================================================================

/**
 * Computes comprehensive statistics for a dataset
 */
export function computeStatistics(values: number[]): MetricStatistics {
  if (values.length === 0) {
    return {
      mean: 0, median: 0, std: 0, mad: 0,
      q1: 0, q3: 0, iqr: 0, min: 0, max: 0, count: 0,
    };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  
  // Mean
  const mean = values.reduce((a, b) => a + b, 0) / n;
  
  // Median
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  
  // Standard deviation
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  
  // Quartiles
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  
  // Median Absolute Deviation
  const deviations = values.map(v => Math.abs(v - median));
  const sortedDeviations = deviations.sort((a, b) => a - b);
  const mad = sortedDeviations.length % 2 === 0
    ? (sortedDeviations[n / 2 - 1] + sortedDeviations[n / 2]) / 2
    : sortedDeviations[Math.floor(n / 2)];
  
  return {
    mean,
    median,
    std,
    mad,
    q1,
    q3,
    iqr,
    min: sorted[0],
    max: sorted[n - 1],
    count: n,
  };
}

/**
 * Computes percentile of a value in a dataset
 */
function computePercentile(value: number, values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter(v => v < value).length;
  return (below / sorted.length) * 100;
}

// ============================================================================
// DETECTION METHODS
// ============================================================================

/**
 * Z-Score based anomaly detection
 * 
 * Flags values more than threshold standard deviations from mean.
 * Works best for normally distributed data.
 */
export function zScoreDetection(
  value: number,
  stats: MetricStatistics,
  threshold: number = 3
): { isAnomaly: boolean; zScore: number; severity: AnomalyEvent['severity'] } {
  if (stats.std === 0) {
    return { isAnomaly: false, zScore: 0, severity: 'low' };
  }
  
  const zScore = (value - stats.mean) / stats.std;
  const absZ = Math.abs(zScore);
  const isAnomaly = absZ > threshold;
  
  let severity: AnomalyEvent['severity'] = 'low';
  if (absZ > threshold * 2) severity = 'critical';
  else if (absZ > threshold * 1.5) severity = 'high';
  else if (absZ > threshold) severity = 'medium';
  
  return { isAnomaly, zScore, severity };
}

/**
 * IQR (Interquartile Range) based anomaly detection
 * 
 * Flags values outside [Q1 - k*IQR, Q3 + k*IQR].
 * Robust to non-normal distributions.
 */
export function iqrDetection(
  value: number,
  stats: MetricStatistics,
  multiplier: number = 1.5
): { isAnomaly: boolean; zScore: number; severity: AnomalyEvent['severity'] } {
  if (stats.iqr === 0) {
    return { isAnomaly: false, zScore: 0, severity: 'low' };
  }
  
  const lowerBound = stats.q1 - multiplier * stats.iqr;
  const upperBound = stats.q3 + multiplier * stats.iqr;
  const isAnomaly = value < lowerBound || value > upperBound;
  
  // Convert to z-score equivalent for comparison
  const deviation = value < lowerBound
    ? lowerBound - value
    : value > upperBound
      ? value - upperBound
      : 0;
  const zScore = deviation / (stats.iqr / 1.35); // IQR to std approximation
  
  let severity: AnomalyEvent['severity'] = 'low';
  if (Math.abs(zScore) > 4) severity = 'critical';
  else if (Math.abs(zScore) > 3) severity = 'high';
  else if (isAnomaly) severity = 'medium';
  
  return { isAnomaly, zScore: value < stats.median ? -zScore : zScore, severity };
}

/**
 * MAD (Median Absolute Deviation) based anomaly detection
 * 
 * Flags values more than threshold MADs from median.
 * Most robust method, resistant to outliers.
 */
export function madDetection(
  value: number,
  stats: MetricStatistics,
  multiplier: number = 3
): { isAnomaly: boolean; zScore: number; severity: AnomalyEvent['severity'] } {
  if (stats.mad === 0) {
    return { isAnomaly: false, zScore: 0, severity: 'low' };
  }
  
  // Modified z-score using MAD
  // 0.6745 is the scaling factor for consistency with normal distribution
  const modifiedZ = 0.6745 * (value - stats.median) / stats.mad;
  const absZ = Math.abs(modifiedZ);
  const isAnomaly = absZ > multiplier;
  
  let severity: AnomalyEvent['severity'] = 'low';
  if (absZ > multiplier * 2) severity = 'critical';
  else if (absZ > multiplier * 1.5) severity = 'high';
  else if (isAnomaly) severity = 'medium';
  
  return { isAnomaly, zScore: modifiedZ, severity };
}

// ============================================================================
// UNIFIED DETECTION
// ============================================================================

/**
 * Detects anomalies using the specified or auto-selected method
 */
export function detectAnomalies(
  observations: Array<{
    entityId: string;
    entityType: string;
    metricName: string;
    value: number;
  }>,
  config: AnomalyConfig = { method: 'auto' }
): AnomalyEvent[] {
  const {
    method = 'auto',
    zScoreThreshold = 1.8,
    iqrMultiplier = 0.8,
    madMultiplier = 2.0,
    minSampleSize = 10,
  } = config;
  
  // Group by metric
  const byMetric = new Map<string, typeof observations>();
  for (const obs of observations) {
    const key = obs.metricName;
    if (!byMetric.has(key)) byMetric.set(key, []);
    byMetric.get(key)!.push(obs);
  }
  
  const anomalies: AnomalyEvent[] = [];
  
  for (const [metricName, metricObs] of byMetric) {
    if (metricObs.length < minSampleSize) continue;
    
    const values = metricObs.map(o => o.value);
    const stats = computeStatistics(values);
    
    // Select method — default to ensemble for best F1
    let selectedMethod = method;
    if (method === 'auto') {
      selectedMethod = 'ensemble';
    }

    for (const obs of metricObs) {
      let result: { isAnomaly: boolean; zScore: number; severity: AnomalyEvent['severity'] };

      if (selectedMethod === 'ensemble') {
        // Ensemble: flag as anomaly if 2+ of 3 methods agree
        const zs = zScoreDetection(obs.value, stats, zScoreThreshold);
        const iq = iqrDetection(obs.value, stats, iqrMultiplier);
        const md = madDetection(obs.value, stats, madMultiplier);
        const votes = [zs, iq, md].filter(r => r.isAnomaly).length;
        const isAnomaly = votes >= 2;
        // Use the strongest z-score and highest severity from agreeing methods
        const allResults = [zs, iq, md];
        const maxAbsZ = Math.max(...allResults.map(r => Math.abs(r.zScore)));
        const bestSeverity = allResults.reduce((best, r) => {
          const order = { critical: 0, high: 1, medium: 2, low: 3 };
          return order[r.severity] < order[best.severity] ? r : best;
        });
        result = {
          isAnomaly,
          zScore: zs.zScore, // use z-score for consistency
          severity: isAnomaly ? bestSeverity.severity : 'low',
        };
      } else {
        switch (selectedMethod) {
          case 'zscore':
            result = zScoreDetection(obs.value, stats, zScoreThreshold);
            break;
          case 'iqr':
            result = iqrDetection(obs.value, stats, iqrMultiplier);
            break;
          case 'mad':
          default:
            result = madDetection(obs.value, stats, madMultiplier);
            break;
        }
      }

      if (result.isAnomaly) {
        anomalies.push({
          entityType: obs.entityType,
          entityId: obs.entityId,
          metricName: obs.metricName,
          observedValue: obs.value,
          expectedValue: selectedMethod === 'zscore' ? stats.mean : stats.median,
          zScore: result.zScore,
          detectionMethod: selectedMethod as DetectionMethod,
          explanation: explainAnomaly(obs.value, stats, result.zScore, selectedMethod as DetectionMethod),
          severity: result.severity,
          detectedAt: new Date(),
          percentile: computePercentile(obs.value, values),
        });
      }
    }
  }
  
  // Sort by severity then z-score
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  anomalies.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return Math.abs(b.zScore) - Math.abs(a.zScore);
  });
  
  return anomalies;
}

/**
 * Computes skewness of a distribution
 */
function computeSkewness(values: number[], stats: MetricStatistics): number {
  if (stats.std === 0 || values.length < 3) return 0;
  
  const n = values.length;
  const sumCubed = values.reduce((sum, v) => 
    sum + Math.pow((v - stats.mean) / stats.std, 3), 0
  );
  
  return (n / ((n - 1) * (n - 2))) * sumCubed;
}

// ============================================================================
// EXPLANATION GENERATION
// ============================================================================

/**
 * Generates human-readable explanation for an anomaly
 */
export function explainAnomaly(
  value: number,
  stats: MetricStatistics,
  zScore: number,
  method: DetectionMethod
): string {
  const direction = value > stats.mean ? 'above' : 'below';
  const absZ = Math.abs(zScore);
  
  const parts: string[] = [];
  
  // Main finding
  if (method === 'zscore') {
    parts.push(`Value ${value.toFixed(2)} is ${absZ.toFixed(1)} standard deviations ${direction} the mean (${stats.mean.toFixed(2)})`);
  } else if (method === 'mad') {
    parts.push(`Value ${value.toFixed(2)} is ${absZ.toFixed(1)} MADs ${direction} the median (${stats.median.toFixed(2)})`);
  } else {
    const bound = value > stats.q3 ? stats.q3 + 1.5 * stats.iqr : stats.q1 - 1.5 * stats.iqr;
    parts.push(`Value ${value.toFixed(2)} is outside the IQR bounds (${bound.toFixed(2)})`);
  }
  
  // Context
  const percentile = ((stats.count - (value > stats.median ? 0 : stats.count)) / stats.count * 100);
  if (absZ > 4) {
    parts.push('This is an extreme outlier that rarely occurs by chance.');
  } else if (absZ > 3) {
    parts.push('This is a significant outlier.');
  }
  
  // Range context
  parts.push(`Normal range: ${stats.q1.toFixed(2)} to ${stats.q3.toFixed(2)}.`);
  
  return parts.join(' ');
}

// ============================================================================
// BATCH ANOMALY DETECTION
// ============================================================================

/**
 * Detects anomalies across multiple metrics for an entity
 */
export function detectEntityAnomalies(
  entityId: string,
  entityType: string,
  currentMetrics: Record<string, number>,
  historicalData: Array<Record<string, number>>,
  config?: AnomalyConfig
): AnomalyEvent[] {
  const observations = Object.entries(currentMetrics).map(([metricName, value]) => ({
    entityId,
    entityType,
    metricName,
    value,
  }));
  
  // Add historical data for statistics
  for (const historical of historicalData) {
    for (const [metricName, value] of Object.entries(historical)) {
      observations.push({
        entityId: `historical_${Math.random()}`,
        entityType,
        metricName,
        value,
      });
    }
  }
  
  // Detect and filter to only current entity
  const allAnomalies = detectAnomalies(observations, config);
  return allAnomalies.filter(a => a.entityId === entityId);
}

/**
 * Summarizes anomalies by severity
 */
export function summarizeAnomalies(anomalies: AnomalyEvent[]): {
  total: number;
  bySeverity: Record<AnomalyEvent['severity'], number>;
  byMetric: Record<string, number>;
  topAnomalies: AnomalyEvent[];
} {
  const bySeverity: Record<AnomalyEvent['severity'], number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  
  const byMetric: Record<string, number> = {};
  
  for (const a of anomalies) {
    bySeverity[a.severity]++;
    byMetric[a.metricName] = (byMetric[a.metricName] || 0) + 1;
  }
  
  return {
    total: anomalies.length,
    bySeverity,
    byMetric,
    topAnomalies: anomalies.slice(0, 5),
  };
}
