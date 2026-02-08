/**
 * Signal to Time Series Converter
 *
 * Transforms sparse cross_domain_signals into aligned daily time series
 * suitable for Granger causality testing.
 *
 * The challenge: Signals arrive at irregular intervals and for different domains.
 * Granger causality requires aligned time series with the same timestamps.
 *
 * Solution:
 * 1. Group signals by domain
 * 2. Aggregate to daily values (sum, mean, or max)
 * 3. Align to a common date range
 * 4. Handle missing days via interpolation or zero-fill
 */

// ============================================================================
// TYPES
// ============================================================================

export interface RawSignal {
  id?: string;
  organization_id: string;
  source_domain: string;
  signal_type: string;
  signal_value: number;
  signal_timestamp: string | Date;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, any>;
}

export interface DailyTimeSeries {
  domain: string;
  dates: Date[];
  values: number[];
  signalTypes: string[]; // Which signal types contributed
  metadata: {
    startDate: Date;
    endDate: Date;
    dayCount: number;
    missingDays: number;
    aggregationMethod: AggregationMethod;
  };
}

export type AggregationMethod = 'sum' | 'mean' | 'max' | 'count';

export interface TimeSeriesConfig {
  /** How to aggregate multiple signals in a day */
  aggregation: AggregationMethod;
  
  /** How to handle missing days */
  fillMethod: 'zero' | 'forward' | 'interpolate' | 'mean';
  
  /** Minimum days of data required */
  minDays: number;
  
  /** Signal types to include (null = all) */
  signalTypes?: string[] | null;
}

export const DEFAULT_TIMESERIES_CONFIG: TimeSeriesConfig = {
  aggregation: 'sum',
  fillMethod: 'zero',
  minDays: 1, // Use ALL stored data — learn from signal_timestamp spread, not calendar days
  signalTypes: null,
};

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Normalize a date to midnight UTC
 */
export function normalizeDate(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Generate all dates in a range
 */
export function generateDateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

/**
 * Get date key for grouping (YYYY-MM-DD)
 */
export function getDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ============================================================================
// SIGNAL AGGREGATION
// ============================================================================

/**
 * Aggregate values based on method
 */
export function aggregateValues(values: number[], method: AggregationMethod): number {
  if (values.length === 0) return 0;
  
  switch (method) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'mean':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'max':
      return Math.max(...values);
    case 'count':
      return values.length;
    default:
      return values.reduce((a, b) => a + b, 0);
  }
}

/**
 * Fill missing values in a time series
 */
export function fillMissingValues(
  values: (number | null)[],
  method: TimeSeriesConfig['fillMethod']
): number[] {
  const result: number[] = [];
  
  // Compute mean for 'mean' fill method
  const nonNullValues = values.filter((v): v is number => v !== null);
  const mean = nonNullValues.length > 0 
    ? nonNullValues.reduce((a, b) => a + b, 0) / nonNullValues.length 
    : 0;
  
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    
    if (val !== null) {
      result.push(val);
      continue;
    }
    
    switch (method) {
      case 'zero':
        result.push(0);
        break;
        
      case 'forward':
        // Use previous non-null value, or 0 if none
        result.push(result.length > 0 ? result[result.length - 1] : 0);
        break;
        
      case 'mean':
        result.push(mean);
        break;
        
      case 'interpolate':
        // Linear interpolation between neighbors
        const prev = result.length > 0 ? result[result.length - 1] : null;
        const next = values.slice(i + 1).find((v): v is number => v !== null) ?? null;
        
        if (prev !== null && next !== null) {
          // Find distance to next non-null
          let stepsToNext = 1;
          for (let j = i + 1; j < values.length && values[j] === null; j++) {
            stepsToNext++;
          }
          result.push(prev + (next - prev) / (stepsToNext + 1));
        } else if (prev !== null) {
          result.push(prev);
        } else if (next !== null) {
          result.push(next);
        } else {
          result.push(0);
        }
        break;
        
      default:
        result.push(0);
    }
  }
  
  return result;
}

// ============================================================================
// MAIN CONVERSION
// ============================================================================

/**
 * Convert raw signals to domain-grouped daily time series
 */
export function signalsToTimeSeries(
  signals: RawSignal[],
  config: TimeSeriesConfig = DEFAULT_TIMESERIES_CONFIG
): Map<string, DailyTimeSeries> {
  if (signals.length === 0) {
    return new Map();
  }
  
  // Filter by signal types if specified
  let filteredSignals = signals;
  if (config.signalTypes && config.signalTypes.length > 0) {
    filteredSignals = signals.filter(s => config.signalTypes!.includes(s.signal_type));
  }
  
  // Group by domain
  const byDomain = new Map<string, RawSignal[]>();
  for (const signal of filteredSignals) {
    const domain = signal.source_domain.toLowerCase();
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(signal);
  }
  
  // Find global date range
  const allDates = filteredSignals.map(s => normalizeDate(s.signal_timestamp));
  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
  const dateRange = generateDateRange(minDate, maxDate);
  
  // Check minimum days
  if (dateRange.length < config.minDays) {
    console.warn(`Insufficient data: ${dateRange.length} days < ${config.minDays} required`);
    // Still proceed with available data
  }
  
  // Convert each domain to aligned time series
  const result = new Map<string, DailyTimeSeries>();
  
  for (const [domain, domainSignals] of byDomain) {
    // Group signals by date
    const byDate = new Map<string, number[]>();
    const signalTypesSet = new Set<string>();
    
    for (const signal of domainSignals) {
      const dateKey = getDateKey(normalizeDate(signal.signal_timestamp));
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey)!.push(signal.signal_value);
      signalTypesSet.add(signal.signal_type);
    }
    
    // Build aligned values array
    let missingDays = 0;
    const rawValues: (number | null)[] = dateRange.map(date => {
      const dateKey = getDateKey(date);
      const dayValues = byDate.get(dateKey);
      
      if (!dayValues || dayValues.length === 0) {
        missingDays++;
        return null;
      }
      
      return aggregateValues(dayValues, config.aggregation);
    });
    
    // Fill missing values
    const values = fillMissingValues(rawValues, config.fillMethod);
    
    result.set(domain, {
      domain,
      dates: dateRange,
      values,
      signalTypes: Array.from(signalTypesSet),
      metadata: {
        startDate: minDate,
        endDate: maxDate,
        dayCount: dateRange.length,
        missingDays,
        aggregationMethod: config.aggregation,
      },
    });
  }
  
  return result;
}

/**
 * Extract a specific time range from a time series
 */
export function sliceTimeSeries(
  series: DailyTimeSeries,
  startDate: Date,
  endDate: Date
): DailyTimeSeries {
  const startIdx = series.dates.findIndex(d => d >= startDate);
  const endIdx = series.dates.findIndex(d => d > endDate);
  
  const sliceEnd = endIdx === -1 ? series.dates.length : endIdx;
  const sliceStart = startIdx === -1 ? 0 : startIdx;
  
  return {
    ...series,
    dates: series.dates.slice(sliceStart, sliceEnd),
    values: series.values.slice(sliceStart, sliceEnd),
    metadata: {
      ...series.metadata,
      startDate,
      endDate,
      dayCount: sliceEnd - sliceStart,
    },
  };
}

/**
 * Difference a time series (first-order differencing for stationarity)
 */
export function differenceTimeSeries(series: DailyTimeSeries): DailyTimeSeries {
  const values: number[] = [];
  
  for (let i = 1; i < series.values.length; i++) {
    values.push(series.values[i] - series.values[i - 1]);
  }
  
  return {
    ...series,
    dates: series.dates.slice(1),
    values,
    metadata: {
      ...series.metadata,
      dayCount: values.length,
    },
  };
}

/**
 * Compute basic statistics for a time series
 */
export function computeTimeSeriesStats(series: DailyTimeSeries): {
  mean: number;
  std: number;
  min: number;
  max: number;
  variance: number;
} {
  const values = series.values;
  const n = values.length;
  
  if (n === 0) {
    return { mean: 0, std: 0, min: 0, max: 0, variance: 0 };
  }
  
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  
  return {
    mean,
    std,
    min: Math.min(...values),
    max: Math.max(...values),
    variance,
  };
}
