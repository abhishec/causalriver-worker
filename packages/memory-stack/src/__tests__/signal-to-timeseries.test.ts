/**
 * Nexus Memory Stack - Signal to Time Series Module Tests
 *
 * Comprehensive tests for converting sparse cross-domain signals into
 * aligned daily time series suitable for Granger causality testing.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeDate,
  generateDateRange,
  getDateKey,
  aggregateValues,
  fillMissingValues,
  signalsToTimeSeries,
  sliceTimeSeries,
  differenceTimeSeries,
  computeTimeSeriesStats,
} from '../causality/signal-to-timeseries';
import type { RawSignal, DailyTimeSeries } from '../causality/signal-to-timeseries';

// ============================================================================
// HELPERS
// ============================================================================

/** Build a RawSignal with sensible defaults. */
function makeSignal(overrides: Partial<RawSignal> = {}): RawSignal {
  return {
    organization_id: 'org-1',
    source_domain: 'crm',
    signal_type: 'deal_created',
    signal_value: 1,
    signal_timestamp: '2025-01-15T10:30:00Z',
    ...overrides,
  };
}

/** Build a minimal DailyTimeSeries for slice / difference / stats tests. */
function makeSeries(values: number[], startIso: string = '2025-01-01'): DailyTimeSeries {
  const startDate = new Date(startIso + 'T00:00:00Z');
  const dates: Date[] = [];
  for (let i = 0; i < values.length; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d);
  }
  return {
    domain: 'test',
    dates,
    values,
    signalTypes: ['metric'],
    metadata: {
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      dayCount: values.length,
      missingDays: 0,
      aggregationMethod: 'sum',
    },
  };
}

// ============================================================================
// DATE UTILITIES
// ============================================================================

describe('Date Utilities', () => {
  // --------------------------------------------------------------------------
  // normalizeDate
  // --------------------------------------------------------------------------

  describe('normalizeDate', () => {
    it('should normalize a Date object to midnight UTC', () => {
      const input = new Date('2025-06-15T14:35:22.123Z');
      const result = normalizeDate(input);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
      expect(result.getUTCMilliseconds()).toBe(0);
      expect(result.getUTCFullYear()).toBe(2025);
      expect(result.getUTCMonth()).toBe(5); // June is month 5
      expect(result.getUTCDate()).toBe(15);
    });

    it('should normalize an ISO string to midnight UTC', () => {
      const result = normalizeDate('2025-03-20T23:59:59.999Z');
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
      expect(result.getUTCMilliseconds()).toBe(0);
      expect(result.getUTCDate()).toBe(20);
    });

    it('should not mutate the original Date object', () => {
      const original = new Date('2025-06-15T14:35:22Z');
      const originalTime = original.getTime();
      normalizeDate(original);
      // The source implementation creates a new Date via `new Date(date)`,
      // so the original should remain unchanged.
      expect(original.getTime()).toBe(originalTime);
    });

    it('should handle date-only strings (YYYY-MM-DD)', () => {
      const result = normalizeDate('2025-12-31');
      expect(result.getUTCFullYear()).toBe(2025);
      expect(result.getUTCMonth()).toBe(11);
      expect(result.getUTCDate()).toBe(31);
      expect(result.getUTCHours()).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // generateDateRange
  // --------------------------------------------------------------------------

  describe('generateDateRange', () => {
    it('should generate all dates between start and end (inclusive)', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-05T00:00:00Z');
      const range = generateDateRange(start, end);

      expect(range).toHaveLength(5);
      expect(getDateKey(range[0])).toBe('2025-01-01');
      expect(getDateKey(range[4])).toBe('2025-01-05');
    });

    it('should return a single-element array when start equals end', () => {
      const d = new Date('2025-07-04T00:00:00Z');
      const range = generateDateRange(d, d);
      expect(range).toHaveLength(1);
      expect(getDateKey(range[0])).toBe('2025-07-04');
    });

    it('should return an empty array when start is after end', () => {
      const start = new Date('2025-02-10T00:00:00Z');
      const end = new Date('2025-02-05T00:00:00Z');
      const range = generateDateRange(start, end);
      expect(range).toHaveLength(0);
    });

    it('should generate correct number of days for a full month', () => {
      const start = new Date('2025-03-01T00:00:00Z');
      const end = new Date('2025-03-31T00:00:00Z');
      const range = generateDateRange(start, end);
      expect(range).toHaveLength(31);
    });
  });

  // --------------------------------------------------------------------------
  // getDateKey
  // --------------------------------------------------------------------------

  describe('getDateKey', () => {
    it('should return YYYY-MM-DD format', () => {
      const d = new Date('2025-09-07T12:00:00Z');
      expect(getDateKey(d)).toBe('2025-09-07');
    });

    it('should zero-pad single-digit months and days', () => {
      const d = new Date('2025-01-03T00:00:00Z');
      expect(getDateKey(d)).toBe('2025-01-03');
    });

    it('should handle year boundaries correctly', () => {
      const d = new Date('2024-12-31T00:00:00Z');
      expect(getDateKey(d)).toBe('2024-12-31');
    });
  });
});

// ============================================================================
// SIGNAL AGGREGATION
// ============================================================================

describe('Signal Aggregation', () => {
  // --------------------------------------------------------------------------
  // aggregateValues
  // --------------------------------------------------------------------------

  describe('aggregateValues', () => {
    it('should sum values with the "sum" method', () => {
      expect(aggregateValues([1, 2, 3, 4], 'sum')).toBe(10);
    });

    it('should compute the mean with the "mean" method', () => {
      expect(aggregateValues([2, 4, 6, 8], 'mean')).toBe(5);
    });

    it('should return the maximum with the "max" method', () => {
      expect(aggregateValues([3, 7, 2, 9, 1], 'max')).toBe(9);
    });

    it('should return the count with the "count" method', () => {
      expect(aggregateValues([10, 20, 30], 'count')).toBe(3);
    });

    it('should return 0 for an empty array regardless of method', () => {
      expect(aggregateValues([], 'sum')).toBe(0);
      expect(aggregateValues([], 'mean')).toBe(0);
      expect(aggregateValues([], 'max')).toBe(0);
      expect(aggregateValues([], 'count')).toBe(0);
    });

    it('should handle a single value correctly', () => {
      expect(aggregateValues([42], 'sum')).toBe(42);
      expect(aggregateValues([42], 'mean')).toBe(42);
      expect(aggregateValues([42], 'max')).toBe(42);
      expect(aggregateValues([42], 'count')).toBe(1);
    });

    it('should handle negative values', () => {
      expect(aggregateValues([-3, -1, -4], 'sum')).toBe(-8);
      expect(aggregateValues([-3, -1, -4], 'max')).toBe(-1);
      expect(aggregateValues([-6, -2], 'mean')).toBe(-4);
    });
  });

  // --------------------------------------------------------------------------
  // fillMissingValues
  // --------------------------------------------------------------------------

  describe('fillMissingValues', () => {
    it('should fill nulls with 0 using the "zero" method', () => {
      const input: (number | null)[] = [1, null, 3, null, 5];
      const result = fillMissingValues(input, 'zero');
      expect(result).toEqual([1, 0, 3, 0, 5]);
    });

    it('should forward-fill nulls using the "forward" method', () => {
      const input: (number | null)[] = [10, null, null, 20, null];
      const result = fillMissingValues(input, 'forward');
      expect(result).toEqual([10, 10, 10, 20, 20]);
    });

    it('should use 0 for leading nulls in "forward" fill', () => {
      const input: (number | null)[] = [null, null, 5];
      const result = fillMissingValues(input, 'forward');
      expect(result[0]).toBe(0);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(5);
    });

    it('should fill nulls with the mean of non-null values using the "mean" method', () => {
      // non-null values: 2, 4, 6 => mean = 4
      const input: (number | null)[] = [2, null, 4, null, 6];
      const result = fillMissingValues(input, 'mean');
      expect(result).toEqual([2, 4, 4, 4, 6]);
    });

    it('should interpolate linearly between neighbors using "interpolate"', () => {
      // [10, null, 20] => interpolated value at index 1 should be between 10 and 20
      const input: (number | null)[] = [10, null, 20];
      const result = fillMissingValues(input, 'interpolate');
      expect(result[0]).toBe(10);
      expect(result[1]).toBe(15); // 10 + (20 - 10) / 2 = 15
      expect(result[2]).toBe(20);
    });

    it('should handle all-null input with zero fill', () => {
      const input: (number | null)[] = [null, null, null];
      const result = fillMissingValues(input, 'zero');
      expect(result).toEqual([0, 0, 0]);
    });

    it('should return values unchanged when there are no nulls', () => {
      const input: (number | null)[] = [1, 2, 3];
      const result = fillMissingValues(input, 'zero');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle empty input', () => {
      const result = fillMissingValues([], 'zero');
      expect(result).toEqual([]);
    });

    it('should handle trailing null in interpolate by carrying forward', () => {
      // [5, null] => prev=5, no next => should carry forward
      const input: (number | null)[] = [5, null];
      const result = fillMissingValues(input, 'interpolate');
      expect(result).toEqual([5, 5]);
    });
  });
});

// ============================================================================
// MAIN CONVERSION: signalsToTimeSeries
// ============================================================================

describe('signalsToTimeSeries', () => {
  it('should return an empty Map when given an empty array', () => {
    const result = signalsToTimeSeries([]);
    expect(result.size).toBe(0);
  });

  it('should group signals by domain and produce one series per domain', () => {
    const signals: RawSignal[] = [
      makeSignal({ source_domain: 'crm', signal_timestamp: '2025-01-01T10:00:00Z', signal_value: 5 }),
      makeSignal({ source_domain: 'crm', signal_timestamp: '2025-01-02T10:00:00Z', signal_value: 3 }),
      makeSignal({ source_domain: 'marketing', signal_timestamp: '2025-01-01T10:00:00Z', signal_value: 10 }),
      makeSignal({ source_domain: 'marketing', signal_timestamp: '2025-01-02T10:00:00Z', signal_value: 7 }),
    ];

    const result = signalsToTimeSeries(signals, {
      aggregation: 'sum',
      fillMethod: 'zero',
      minDays: 1,
      signalTypes: null,
    });

    expect(result.size).toBe(2);
    expect(result.has('crm')).toBe(true);
    expect(result.has('marketing')).toBe(true);
  });

  it('should aggregate multiple signals on the same day with the configured method', () => {
    const signals: RawSignal[] = [
      makeSignal({ signal_timestamp: '2025-01-01T08:00:00Z', signal_value: 3 }),
      makeSignal({ signal_timestamp: '2025-01-01T16:00:00Z', signal_value: 7 }),
    ];

    const sumResult = signalsToTimeSeries(signals, {
      aggregation: 'sum',
      fillMethod: 'zero',
      minDays: 1,
      signalTypes: null,
    });
    expect(sumResult.get('crm')!.values[0]).toBe(10);

    const meanResult = signalsToTimeSeries(signals, {
      aggregation: 'mean',
      fillMethod: 'zero',
      minDays: 1,
      signalTypes: null,
    });
    expect(meanResult.get('crm')!.values[0]).toBe(5);

    const maxResult = signalsToTimeSeries(signals, {
      aggregation: 'max',
      fillMethod: 'zero',
      minDays: 1,
      signalTypes: null,
    });
    expect(maxResult.get('crm')!.values[0]).toBe(7);

    const countResult = signalsToTimeSeries(signals, {
      aggregation: 'count',
      fillMethod: 'zero',
      minDays: 1,
      signalTypes: null,
    });
    expect(countResult.get('crm')!.values[0]).toBe(2);
  });

  it('should align all domains to the same global date range', () => {
    const signals: RawSignal[] = [
      // CRM only has data on day 1
      makeSignal({ source_domain: 'crm', signal_timestamp: '2025-01-01T00:00:00Z', signal_value: 1 }),
      // Marketing only has data on day 3
      makeSignal({ source_domain: 'marketing', signal_timestamp: '2025-01-03T00:00:00Z', signal_value: 2 }),
    ];

    const result = signalsToTimeSeries(signals, {
      aggregation: 'sum',
      fillMethod: 'zero',
      minDays: 1,
      signalTypes: null,
    });

    const crm = result.get('crm')!;
    const marketing = result.get('marketing')!;

    // Both should span 3 days (Jan 1 - Jan 3)
    expect(crm.dates).toHaveLength(3);
    expect(marketing.dates).toHaveLength(3);
    // CRM: has data on day 1, missing days 2 & 3 (zero-filled)
    expect(crm.values).toEqual([1, 0, 0]);
    // Marketing: missing days 1 & 2, has data on day 3
    expect(marketing.values).toEqual([0, 0, 2]);
  });

  it('should filter signals by signalTypes when configured', () => {
    const signals: RawSignal[] = [
      makeSignal({ signal_type: 'deal_created', signal_timestamp: '2025-01-01T00:00:00Z', signal_value: 10 }),
      makeSignal({ signal_type: 'email_sent', signal_timestamp: '2025-01-01T00:00:00Z', signal_value: 5 }),
      makeSignal({ signal_type: 'deal_created', signal_timestamp: '2025-01-02T00:00:00Z', signal_value: 8 }),
    ];

    const result = signalsToTimeSeries(signals, {
      aggregation: 'sum',
      fillMethod: 'zero',
      minDays: 1,
      signalTypes: ['deal_created'],
    });

    const series = result.get('crm')!;
    // Only deal_created signals should be present
    expect(series.signalTypes).toContain('deal_created');
    expect(series.signalTypes).not.toContain('email_sent');
    expect(series.values).toEqual([10, 8]);
  });

  it('should normalise domain names to lowercase', () => {
    const signals: RawSignal[] = [
      makeSignal({ source_domain: 'CRM', signal_timestamp: '2025-01-01T00:00:00Z' }),
      makeSignal({ source_domain: 'crm', signal_timestamp: '2025-01-02T00:00:00Z' }),
    ];

    const result = signalsToTimeSeries(signals, {
      aggregation: 'sum',
      fillMethod: 'zero',
      minDays: 1,
      signalTypes: null,
    });

    // Both signals should end up under the same 'crm' key
    expect(result.size).toBe(1);
    expect(result.has('crm')).toBe(true);
  });

  it('should populate metadata correctly', () => {
    const signals: RawSignal[] = [
      makeSignal({ signal_timestamp: '2025-01-01T00:00:00Z', signal_value: 1 }),
      makeSignal({ signal_timestamp: '2025-01-05T00:00:00Z', signal_value: 2 }),
    ];

    const result = signalsToTimeSeries(signals, {
      aggregation: 'sum',
      fillMethod: 'zero',
      minDays: 1,
      signalTypes: null,
    });

    const series = result.get('crm')!;
    expect(series.metadata.dayCount).toBe(5);
    expect(series.metadata.missingDays).toBe(3); // Jan 2, 3, 4 are missing
    expect(series.metadata.aggregationMethod).toBe('sum');
    expect(getDateKey(series.metadata.startDate)).toBe('2025-01-01');
    expect(getDateKey(series.metadata.endDate)).toBe('2025-01-05');
  });

  it('should handle a single signal correctly', () => {
    const signals: RawSignal[] = [
      makeSignal({ signal_timestamp: '2025-06-15T12:00:00Z', signal_value: 42 }),
    ];

    const result = signalsToTimeSeries(signals, {
      aggregation: 'sum',
      fillMethod: 'zero',
      minDays: 1,
      signalTypes: null,
    });

    const series = result.get('crm')!;
    expect(series.dates).toHaveLength(1);
    expect(series.values).toEqual([42]);
    expect(series.metadata.missingDays).toBe(0);
    expect(series.metadata.dayCount).toBe(1);
  });
});

// ============================================================================
// TIME SERIES OPERATIONS
// ============================================================================

describe('Time Series Operations', () => {
  // --------------------------------------------------------------------------
  // sliceTimeSeries
  // --------------------------------------------------------------------------

  describe('sliceTimeSeries', () => {
    it('should extract the correct sub-range of dates and values', () => {
      const series = makeSeries([10, 20, 30, 40, 50], '2025-01-01');
      const sliceStart = new Date('2025-01-02T00:00:00Z');
      const sliceEnd = new Date('2025-01-04T00:00:00Z');

      const sliced = sliceTimeSeries(series, sliceStart, sliceEnd);

      expect(sliced.dates).toHaveLength(3);
      expect(sliced.values).toEqual([20, 30, 40]);
      expect(sliced.metadata.dayCount).toBe(3);
    });

    it('should return all data when slice range covers entire series', () => {
      const series = makeSeries([1, 2, 3], '2025-01-01');
      const sliced = sliceTimeSeries(
        series,
        new Date('2024-12-01T00:00:00Z'),
        new Date('2025-12-31T00:00:00Z'),
      );
      expect(sliced.values).toEqual([1, 2, 3]);
    });

    it('should return full series when slice range is entirely after series dates', () => {
      // When startDate is after all series dates, findIndex returns -1 => sliceStart=0
      // When endDate is after all series dates, findIndex returns -1 => sliceEnd=series.length
      // The implementation does not filter out-of-range dates; it defaults to full range
      const series = makeSeries([1, 2, 3], '2025-01-01');
      const sliced = sliceTimeSeries(
        series,
        new Date('2025-06-01T00:00:00Z'),
        new Date('2025-06-30T00:00:00Z'),
      );
      expect(sliced.dates).toHaveLength(3);
      expect(sliced.values).toEqual([1, 2, 3]);
    });

    it('should update metadata start/end dates to the requested range', () => {
      const series = makeSeries([1, 2, 3, 4, 5], '2025-01-01');
      const sliceStart = new Date('2025-01-02T00:00:00Z');
      const sliceEnd = new Date('2025-01-04T00:00:00Z');
      const sliced = sliceTimeSeries(series, sliceStart, sliceEnd);

      expect(sliced.metadata.startDate.getTime()).toBe(sliceStart.getTime());
      expect(sliced.metadata.endDate.getTime()).toBe(sliceEnd.getTime());
    });
  });

  // --------------------------------------------------------------------------
  // differenceTimeSeries
  // --------------------------------------------------------------------------

  describe('differenceTimeSeries', () => {
    it('should compute first-order differences correctly', () => {
      const series = makeSeries([10, 13, 11, 17, 20]);
      const diffed = differenceTimeSeries(series);

      expect(diffed.values).toEqual([3, -2, 6, 3]);
      expect(diffed.dates).toHaveLength(4);
      expect(diffed.metadata.dayCount).toBe(4);
    });

    it('should return zero differences for a constant series', () => {
      const series = makeSeries([5, 5, 5, 5]);
      const diffed = differenceTimeSeries(series);
      expect(diffed.values).toEqual([0, 0, 0]);
    });

    it('should lose one element relative to the original series', () => {
      const n = 10;
      const series = makeSeries(Array.from({ length: n }, (_, i) => i));
      const diffed = differenceTimeSeries(series);
      expect(diffed.values).toHaveLength(n - 1);
      expect(diffed.dates).toHaveLength(n - 1);
    });

    it('should drop the first date from the dates array', () => {
      const series = makeSeries([1, 2, 3], '2025-01-01');
      const diffed = differenceTimeSeries(series);
      expect(getDateKey(diffed.dates[0])).toBe('2025-01-02');
    });

    it('should handle a two-element series', () => {
      const series = makeSeries([100, 130]);
      const diffed = differenceTimeSeries(series);
      expect(diffed.values).toEqual([30]);
      expect(diffed.dates).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // computeTimeSeriesStats
  // --------------------------------------------------------------------------

  describe('computeTimeSeriesStats', () => {
    it('should compute correct mean, std, min, max, variance', () => {
      // values: [2, 4, 6, 8, 10]
      // mean = 6, variance = ((16+4+0+4+16)/5) = 8, std = sqrt(8)
      const series = makeSeries([2, 4, 6, 8, 10]);
      const stats = computeTimeSeriesStats(series);

      expect(stats.mean).toBeCloseTo(6, 5);
      expect(stats.variance).toBeCloseTo(8, 5);
      expect(stats.std).toBeCloseTo(Math.sqrt(8), 5);
      expect(stats.min).toBe(2);
      expect(stats.max).toBe(10);
    });

    it('should return all zeros for an empty series', () => {
      const series = makeSeries([]);
      const stats = computeTimeSeriesStats(series);

      expect(stats.mean).toBe(0);
      expect(stats.std).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.variance).toBe(0);
    });

    it('should handle a single-value series', () => {
      const series = makeSeries([7]);
      const stats = computeTimeSeriesStats(series);

      expect(stats.mean).toBe(7);
      expect(stats.min).toBe(7);
      expect(stats.max).toBe(7);
      expect(stats.variance).toBe(0);
      expect(stats.std).toBe(0);
    });

    it('should return zero variance for a constant series', () => {
      const series = makeSeries([3, 3, 3, 3, 3]);
      const stats = computeTimeSeriesStats(series);

      expect(stats.mean).toBe(3);
      expect(stats.variance).toBeCloseTo(0, 10);
      expect(stats.std).toBeCloseTo(0, 10);
    });

    it('should handle negative values', () => {
      const series = makeSeries([-10, -5, 0, 5, 10]);
      const stats = computeTimeSeriesStats(series);

      expect(stats.mean).toBe(0);
      expect(stats.min).toBe(-10);
      expect(stats.max).toBe(10);
      expect(stats.variance).toBeCloseTo(50, 5); // ((100+25+0+25+100)/5)
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('signalsToTimeSeries should handle signals across many domains', () => {
    const domains = ['crm', 'marketing', 'support', 'billing', 'analytics'];
    const signals: RawSignal[] = domains.flatMap((domain) => [
      makeSignal({ source_domain: domain, signal_timestamp: '2025-01-01T00:00:00Z', signal_value: 1 }),
      makeSignal({ source_domain: domain, signal_timestamp: '2025-01-02T00:00:00Z', signal_value: 2 }),
    ]);

    const result = signalsToTimeSeries(signals, {
      aggregation: 'sum',
      fillMethod: 'zero',
      minDays: 1,
      signalTypes: null,
    });

    expect(result.size).toBe(5);
    for (const domain of domains) {
      expect(result.has(domain)).toBe(true);
      const series = result.get(domain)!;
      expect(series.dates).toHaveLength(2);
      expect(series.values).toEqual([1, 2]);
    }
  });

  it('differenceTimeSeries of a single-value series should produce empty values', () => {
    const series = makeSeries([42]);
    const diffed = differenceTimeSeries(series);
    expect(diffed.values).toHaveLength(0);
    expect(diffed.dates).toHaveLength(0);
  });

  it('fillMissingValues "interpolate" should handle all-null input', () => {
    const result = fillMissingValues([null, null, null], 'interpolate');
    // No prev and no next for any position => all should be 0
    expect(result).toEqual([0, 0, 0]);
  });

  it('fillMissingValues "mean" should return zeros when all values are null', () => {
    const result = fillMissingValues([null, null], 'mean');
    // Mean of no non-null values is 0
    expect(result).toEqual([0, 0]);
  });
});
