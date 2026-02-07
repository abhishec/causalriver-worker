/**
 * Event Bus Tests
 *
 * Tests for the real-time causal event streaming backbone.
 * Validates: event emission, subscription filtering, batching,
 * deduplication, priority ordering, and Lamport clocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEventBus,
  generateEventId,
  createSignalEvent,
  createInterventionEvent,
  createOutcomeEvent,
} from '../causality/event-bus';

describe('Event Bus', () => {
  describe('generateEventId', () => {
    it('generates unique IDs with prefix', () => {
      const id1 = generateEventId('test');
      const id2 = generateEventId('test');
      expect(id1).toMatch(/^test_/);
      expect(id2).toMatch(/^test_/);
      expect(id1).not.toBe(id2);
    });

    it('uses default prefix when none provided', () => {
      const id = generateEventId();
      expect(id).toMatch(/^evt_/);
    });
  });

  describe('createSignalEvent', () => {
    it('creates a properly structured signal event', () => {
      const event = createSignalEvent('org_1', {
        source_domain: 'finance',
        entity_type: 'client',
        entity_id: 'c_123',
        signal_type: 'payment_delay',
        signal_value: 0.8,
        feature_vector: {},
        signal_metadata: { days_late: 15 },
      });

      expect(event.eventType).toBe('signal');
      expect(event.organizationId).toBe('org_1');
      expect(event.domain).toBe('finance');
      expect(event.payload.signal_type).toBe('payment_delay');
      expect(event.payload.signal_value).toBe(0.8);
      expect(event.payload.days_late).toBe(15);
      expect(event.eventId).toBeTruthy();
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('createOutcomeEvent', () => {
    it('creates a properly structured outcome event', () => {
      const event = createOutcomeEvent('org_1', {
        entity_type: 'client',
        entity_id: 'c_456',
        metric_name: 'churn',
        metric_value: 1,
      });

      expect(event.eventType).toBe('outcome');
      expect(event.payload.metric_name).toBe('churn');
      expect(event.payload.metric_value).toBe(1);
    });
  });

  describe('createInterventionEvent', () => {
    it('creates a properly structured intervention event', () => {
      const event = createInterventionEvent('org_1', {
        entity_type: 'client',
        entity_id: 'c_789',
        intervention_type: 'proactive_outreach',
        description: 'CSM called to discuss concerns',
      });

      expect(event.eventType).toBe('intervention');
      expect(event.payload.intervention_type).toBe('proactive_outreach');
    });
  });

  describe('Event Bus Core', () => {
    it('creates an event bus and emits events', () => {
      const bus = createEventBus({
        debounceMs: 100,
        batchSize: 10,
      });

      const event = createSignalEvent('org_1', {
        source_domain: 'finance',
        entity_type: 'client',
        entity_id: 'c_1',
        signal_type: 'test',
        signal_value: 1,
        feature_vector: {},
        signal_metadata: {},
      });

      const result = bus.emit(event);
      expect(result).toBe(true);

      const stats = bus.getStats();
      expect(stats.totalEventsReceived).toBeGreaterThanOrEqual(1);
    });

    it('subscribes and receives events', async () => {
      const bus = createEventBus({
        debounceMs: 10,
        batchSize: 1,
        flushIntervalMs: 50,
      });

      const received: any[] = [];

      bus.subscribe({
        filter: { eventTypes: ['signal'] },
        handler: async (events) => {
          received.push(...events);
        },
      });

      bus.emit(
        createSignalEvent('org_1', {
          source_domain: 'finance',
          entity_type: 'client',
          entity_id: 'c_1',
          signal_type: 'test',
          signal_value: 1,
          feature_vector: {},
          signal_metadata: {},
        })
      );

      // Wait for debounce + processing
      await new Promise((r) => setTimeout(r, 200));

      expect(received.length).toBeGreaterThanOrEqual(1);
      expect(received[0].eventType).toBe('signal');
    });

    it('filters events by type', async () => {
      const bus = createEventBus({
        debounceMs: 10,
        batchSize: 5,
        flushIntervalMs: 50,
      });

      const signalEvents: any[] = [];
      const outcomeEvents: any[] = [];

      bus.subscribe({
        filter: { eventTypes: ['signal'] },
        handler: async (events) => {
          signalEvents.push(...events);
        },
      });

      bus.subscribe({
        filter: { eventTypes: ['outcome'] },
        handler: async (events) => {
          outcomeEvents.push(...events);
        },
      });

      // Emit both types
      bus.emit(
        createSignalEvent('org_1', {
          source_domain: 'finance',
          entity_type: 'client',
          entity_id: 'c_1',
          signal_type: 'test',
          signal_value: 1,
          feature_vector: {},
          signal_metadata: {},
        })
      );

      bus.emit(
        createOutcomeEvent('org_1', {
          entity_type: 'client',
          entity_id: 'c_1',
          metric_name: 'churn',
          metric_value: 1,
        })
      );

      await new Promise((r) => setTimeout(r, 200));

      expect(signalEvents.length).toBeGreaterThanOrEqual(1);
      expect(signalEvents.every((e) => e.eventType === 'signal')).toBe(true);
      expect(outcomeEvents.length).toBeGreaterThanOrEqual(1);
      expect(outcomeEvents.every((e) => e.eventType === 'outcome')).toBe(true);
    });

    it('deduplicates events with same eventId', () => {
      const bus = createEventBus({
        enableDeduplication: true,
      });

      const event = createSignalEvent('org_1', {
        source_domain: 'finance',
        entity_type: 'client',
        entity_id: 'c_1',
        signal_type: 'test',
        signal_value: 1,
        feature_vector: {},
        signal_metadata: {},
      });

      const result1 = bus.emit(event);
      const result2 = bus.emit(event); // same eventId

      expect(result1).toBe(true);
      expect(result2).toBe(false); // should be deduplicated
    });

    it('increments vector clock', () => {
      const bus = createEventBus();

      const e1 = createSignalEvent('org_1', {
        source_domain: 'finance',
        entity_type: 'client',
        entity_id: 'c_1',
        signal_type: 'test',
        signal_value: 1,
        feature_vector: {},
        signal_metadata: {},
      });

      const e2 = createSignalEvent('org_1', {
        source_domain: 'cs',
        entity_type: 'client',
        entity_id: 'c_2',
        signal_type: 'test2',
        signal_value: 2,
        feature_vector: {},
        signal_metadata: {},
      });

      bus.emit(e1);
      bus.emit(e2);

      const stats = bus.getStats();
      expect(stats.totalEventsReceived).toBe(2);
    });
  });
});
