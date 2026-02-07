/**
 * Nexus Memory Stack - Signal Collector Module Tests
 *
 * Comprehensive tests for cross-domain signal collection framework:
 * normalizeSignalValue, getSeverityFromSignal, createSignalBuilder,
 * and createSignalCollector factory with mock collectors.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  normalizeSignalValue,
  getSeverityFromSignal,
  createSignalBuilder,
  createSignalCollector,
} from '../causality/signal-collector';
import type {
  CrossDomainSignal,
  SignalCollectorConfig,
} from '../causality/signal-collector';
import { createMockSupabase } from './helpers/mock-supabase';

// ============================================================================
// MOCK COLLECTORS
// ============================================================================

const mockCollector1: SignalCollectorConfig = {
  name: 'test1',
  source_domain: 'finance',
  collect: async () => [
    {
      signal_type: 'test',
      source_domain: 'finance',
      entity_type: 'client',
      entity_id: 'c1',
      signal_value: -0.5,
      feature_vector: { x: 1 },
      signal_metadata: {},
      lookback_window_days: 30,
    },
  ],
};

const mockCollector2: SignalCollectorConfig = {
  name: 'test2',
  source_domain: 'cs',
  collect: async () => [
    {
      signal_type: 'test2',
      source_domain: 'cs',
      entity_type: 'client',
      entity_id: 'c2',
      signal_value: 0.8,
      feature_vector: { y: 2 },
      signal_metadata: {},
      lookback_window_days: 60,
    },
  ],
};

const failingCollector: SignalCollectorConfig = {
  name: 'failing',
  source_domain: 'revenue',
  collect: async () => {
    throw new Error('DB connection failed');
  },
};

// ============================================================================
// normalizeSignalValue
// ============================================================================

describe('normalizeSignalValue', () => {
  it('clamps value to default range [-1, 1]', () => {
    expect(normalizeSignalValue(-5)).toBe(-1);
    expect(normalizeSignalValue(5)).toBe(1);
    expect(normalizeSignalValue(0)).toBe(0);
    expect(normalizeSignalValue(0.5)).toBe(0.5);
    expect(normalizeSignalValue(-0.3)).toBe(-0.3);
  });

  it('clamps positive value to max', () => {
    expect(normalizeSignalValue(100)).toBe(1);
    expect(normalizeSignalValue(1.5)).toBe(1);
    expect(normalizeSignalValue(999)).toBe(1);
  });

  it('inverts value when invert=true', () => {
    expect(normalizeSignalValue(0.7, { invert: true })).toBe(-0.7);
    expect(normalizeSignalValue(-0.4, { invert: true })).toBe(0.4);
    expect(normalizeSignalValue(0, { invert: true })).toBe(-0);
  });

  it('clamps with custom min/max', () => {
    expect(normalizeSignalValue(5, { min: 0, max: 10 })).toBe(5);
    expect(normalizeSignalValue(-3, { min: 0, max: 10 })).toBe(0);
    expect(normalizeSignalValue(15, { min: 0, max: 10 })).toBe(10);
    expect(normalizeSignalValue(0.5, { min: -0.5, max: 0.5 })).toBe(0.5);
    expect(normalizeSignalValue(1, { min: -0.5, max: 0.5 })).toBe(0.5);
  });
});

// ============================================================================
// getSeverityFromSignal
// ============================================================================

describe('getSeverityFromSignal', () => {
  it('returns critical for signal value <= -0.8', () => {
    expect(getSeverityFromSignal(-0.8)).toBe('critical');
    expect(getSeverityFromSignal(-1.0)).toBe('critical');
    expect(getSeverityFromSignal(-0.95)).toBe('critical');
  });

  it('returns high for signal value <= -0.5', () => {
    expect(getSeverityFromSignal(-0.5)).toBe('high');
    expect(getSeverityFromSignal(-0.6)).toBe('high');
    expect(getSeverityFromSignal(-0.79)).toBe('high');
  });

  it('returns medium for signal value <= -0.2', () => {
    expect(getSeverityFromSignal(-0.2)).toBe('medium');
    expect(getSeverityFromSignal(-0.3)).toBe('medium');
    expect(getSeverityFromSignal(-0.49)).toBe('medium');
  });

  it('returns low for signal value > -0.2', () => {
    expect(getSeverityFromSignal(-0.1)).toBe('low');
    expect(getSeverityFromSignal(0)).toBe('low');
    expect(getSeverityFromSignal(0.5)).toBe('low');
    expect(getSeverityFromSignal(1)).toBe('low');
  });

  it('uses custom thresholds when provided', () => {
    const thresholds = { critical: -0.9, high: -0.7, medium: -0.4 };
    expect(getSeverityFromSignal(-0.9, thresholds)).toBe('critical');
    expect(getSeverityFromSignal(-0.85, thresholds)).toBe('high');
    expect(getSeverityFromSignal(-0.7, thresholds)).toBe('high');
    expect(getSeverityFromSignal(-0.5, thresholds)).toBe('medium');
    expect(getSeverityFromSignal(-0.3, thresholds)).toBe('low');
  });
});

// ============================================================================
// createSignalBuilder
// ============================================================================

describe('createSignalBuilder', () => {
  describe('risk', () => {
    it('clamps value to [-1, 0]', () => {
      const builder = createSignalBuilder('finance');
      const signal = builder.risk({
        type: 'churn_risk',
        entityType: 'client',
        entityId: 'c1',
        value: 0.5,
        features: { x: 1 },
      });
      expect(signal.signal_value).toBe(0);

      const signalNeg = builder.risk({
        type: 'churn_risk',
        entityType: 'client',
        entityId: 'c1',
        value: -2,
        features: { x: 1 },
      });
      expect(signalNeg.signal_value).toBe(-1);

      const signalMid = builder.risk({
        type: 'churn_risk',
        entityType: 'client',
        entityId: 'c1',
        value: -0.6,
        features: { x: 1 },
      });
      expect(signalMid.signal_value).toBe(-0.6);
    });

    it('sets source_domain correctly from builder domain', () => {
      const builder = createSignalBuilder('finance');
      const signal = builder.risk({
        type: 'payment_delay',
        entityType: 'client',
        entityId: 'c1',
        value: -0.5,
        features: { days_late: 15 },
      });
      expect(signal.source_domain).toBe('finance');

      const csBuilder = createSignalBuilder('client_success');
      const csSignal = csBuilder.risk({
        type: 'usage_decline',
        entityType: 'client',
        entityId: 'c2',
        value: -0.3,
        features: { usage_drop: 0.4 },
      });
      expect(csSignal.source_domain).toBe('client_success');
    });

    it('adds severity to signal_metadata', () => {
      const builder = createSignalBuilder('finance');
      const critical = builder.risk({
        type: 'churn_risk',
        entityType: 'client',
        entityId: 'c1',
        value: -0.9,
        features: { x: 1 },
      });
      expect(critical.signal_metadata.severity).toBe('critical');

      const high = builder.risk({
        type: 'churn_risk',
        entityType: 'client',
        entityId: 'c1',
        value: -0.6,
        features: { x: 1 },
      });
      expect(high.signal_metadata.severity).toBe('high');

      const medium = builder.risk({
        type: 'churn_risk',
        entityType: 'client',
        entityId: 'c1',
        value: -0.3,
        features: { x: 1 },
      });
      expect(medium.signal_metadata.severity).toBe('medium');
    });
  });

  describe('opportunity', () => {
    it('clamps value to [0, 1]', () => {
      const builder = createSignalBuilder('cs');
      const signal = builder.opportunity({
        type: 'expansion',
        entityType: 'client',
        entityId: 'c1',
        value: -0.5,
        features: { growth: 0.8 },
      });
      expect(signal.signal_value).toBe(0);

      const signalHigh = builder.opportunity({
        type: 'expansion',
        entityType: 'client',
        entityId: 'c1',
        value: 2.0,
        features: { growth: 0.8 },
      });
      expect(signalHigh.signal_value).toBe(1);

      const signalMid = builder.opportunity({
        type: 'expansion',
        entityType: 'client',
        entityId: 'c1',
        value: 0.6,
        features: { growth: 0.8 },
      });
      expect(signalMid.signal_value).toBe(0.6);
    });

    it('adds opportunity_level to signal_metadata', () => {
      const builder = createSignalBuilder('cs');
      const low = builder.opportunity({
        type: 'expansion',
        entityType: 'client',
        entityId: 'c1',
        value: 0.2,
        features: {},
      });
      expect(low.signal_metadata.opportunity_level).toBe('low');

      const medium = builder.opportunity({
        type: 'expansion',
        entityType: 'client',
        entityId: 'c1',
        value: 0.5,
        features: {},
      });
      expect(medium.signal_metadata.opportunity_level).toBe('medium');
    });

    it('returns high opportunity_level for value > 0.7', () => {
      const builder = createSignalBuilder('cs');
      const high = builder.opportunity({
        type: 'expansion',
        entityType: 'client',
        entityId: 'c1',
        value: 0.85,
        features: {},
      });
      expect(high.signal_metadata.opportunity_level).toBe('high');

      const edgeHigh = builder.opportunity({
        type: 'expansion',
        entityType: 'client',
        entityId: 'c1',
        value: 0.71,
        features: {},
      });
      expect(edgeHigh.signal_metadata.opportunity_level).toBe('high');
    });
  });
});

// ============================================================================
// createSignalCollector
// ============================================================================

describe('createSignalCollector', () => {
  it('getCollectors returns collector name and source_domain list', () => {
    const engine = createSignalCollector({
      collectors: [mockCollector1, mockCollector2],
    });
    const list = engine.getCollectors();
    expect(list).toEqual([
      { name: 'test1', source_domain: 'finance' },
      { name: 'test2', source_domain: 'cs' },
    ]);
  });

  describe('collectAll', () => {
    it('runs all collectors and aggregates signals', async () => {
      const engine = createSignalCollector({
        collectors: [mockCollector1, mockCollector2],
      });
      const supabase = createMockSupabase();
      const result = await engine.collectAll(supabase as any, 'org-1');

      expect(result.success).toBe(true);
      expect(result.signals_collected).toBe(2);
      expect(result.organizations_processed).toBe(1);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.errors).toBeUndefined();
    });

    it('handles collector errors gracefully via Promise.allSettled', async () => {
      const engine = createSignalCollector({
        collectors: [mockCollector1, failingCollector, mockCollector2],
      });
      const supabase = createMockSupabase();
      const result = await engine.collectAll(supabase as any, 'org-1');

      expect(result.success).toBe(false);
      expect(result.signals_collected).toBe(2);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBe(1);
      expect(result.errors![0]).toContain('failing');
      expect(result.errors![0]).toContain('DB connection failed');
    });

    it('calls onSignalsCollected callback with aggregated signals', async () => {
      const onCollected = vi.fn().mockResolvedValue(undefined);
      const engine = createSignalCollector({
        collectors: [mockCollector1, mockCollector2],
        onSignalsCollected: onCollected,
      });
      const supabase = createMockSupabase();
      await engine.collectAll(supabase as any, 'org-1');

      expect(onCollected).toHaveBeenCalledTimes(1);
      expect(onCollected).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ signal_type: 'test', entity_id: 'c1' }),
          expect.objectContaining({ signal_type: 'test2', entity_id: 'c2' }),
        ]),
        'org-1'
      );
    });

    it('returns correct signals_by_type keyed by collector name', async () => {
      const engine = createSignalCollector({
        collectors: [mockCollector1, mockCollector2],
      });
      const supabase = createMockSupabase();
      const result = await engine.collectAll(supabase as any, 'org-1');

      expect(result.signals_by_type).toEqual({
        test1: 1,
        test2: 1,
      });
    });
  });

  describe('collectByName', () => {
    it('returns signals from the named collector', async () => {
      const engine = createSignalCollector({
        collectors: [mockCollector1, mockCollector2],
      });
      const supabase = createMockSupabase();
      const signals = await engine.collectByName(supabase as any, 'org-1', 'test2');

      expect(signals).toHaveLength(1);
      expect(signals[0].signal_type).toBe('test2');
      expect(signals[0].source_domain).toBe('cs');
      expect(signals[0].entity_id).toBe('c2');
    });

    it('throws an error for an unknown collector name', async () => {
      const engine = createSignalCollector({
        collectors: [mockCollector1],
      });
      const supabase = createMockSupabase();

      await expect(
        engine.collectByName(supabase as any, 'org-1', 'nonexistent')
      ).rejects.toThrow('Collector not found: nonexistent');
    });
  });
});
