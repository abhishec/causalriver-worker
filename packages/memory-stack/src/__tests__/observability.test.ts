/**
 * Tests for Observability Module (Logger + Metrics)
 */
import { describe, it, expect, vi } from 'vitest';
import { createLogger, type LogEntry, type NexusLogger } from '../observability/logger';
import { createMetrics, type NexusMetrics } from '../observability/metrics';

describe('Logger', () => {
  describe('createLogger', () => {
    it('should create a logger instance', () => {
      const logger = createLogger({ level: 'silent' });

      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.child).toBeDefined();
      expect(logger.startTimer).toBeDefined();
    });

    it('should respect log levels', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        level: 'warn',
        destination: { write: (e) => entries.push(e) },
      });

      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      expect(entries.length).toBe(2);
      expect(entries[0].level).toBe('warn');
      expect(entries[1].level).toBe('error');
    });

    it('should include structured data', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        level: 'info',
        destination: { write: (e) => entries.push(e) },
      });

      logger.info('signal received', { domain: 'engineering', count: 5 });

      expect(entries[0].domain).toBe('engineering');
      expect(entries[0].count).toBe(5);
    });

    it('should include base fields in every entry', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        level: 'info',
        base: { organizationId: 'org_123', service: 'nexusbrain' },
        destination: { write: (e) => entries.push(e) },
      });

      logger.info('test');

      expect(entries[0].organizationId).toBe('org_123');
      expect(entries[0].service).toBe('nexusbrain');
    });

    it('should include logger name', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        level: 'info',
        name: 'causal-engine',
        destination: { write: (e) => entries.push(e) },
      });

      logger.info('test');
      expect(entries[0].name).toBe('causal-engine');
    });

    it('should include ISO timestamp', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        level: 'info',
        destination: { write: (e) => entries.push(e) },
      });

      logger.info('test');
      expect(entries[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('Sensitive Field Redaction', () => {
    it('should redact sensitive fields', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        level: 'info',
        destination: { write: (e) => entries.push(e) },
      });

      logger.info('config loaded', {
        apiKey: 'sk-secret-123',
        database: 'prod-db',
      });

      expect(entries[0].apiKey).toBe('[REDACTED]');
      expect(entries[0].database).toBe('prod-db');
    });

    it('should redact nested sensitive fields', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        level: 'info',
        destination: { write: (e) => entries.push(e) },
      });

      logger.info('nested config', {
        config: {
          embeddingApiKey: 'my-secret',
          model: 'openai',
        },
      });

      const config = entries[0].config as any;
      expect(config.embeddingApiKey).toBe('[REDACTED]');
      expect(config.model).toBe('openai');
    });
  });

  describe('Child Loggers', () => {
    it('should create child logger with inherited context', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        level: 'info',
        base: { orgId: 'org_1' },
        destination: { write: (e) => entries.push(e) },
      });

      const child = logger.child({ layer: 'L4', module: 'causal' });
      child.info('discovery started');

      expect(entries[0].orgId).toBe('org_1');
      expect(entries[0].layer).toBe('L4');
      expect(entries[0].module).toBe('causal');
    });
  });

  describe('Timers', () => {
    it('should measure elapsed time', async () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        level: 'debug',
        destination: { write: (e) => entries.push(e) },
      });

      const stop = logger.startTimer('query');
      await new Promise(r => setTimeout(r, 50));
      const elapsed = stop();

      expect(elapsed).toBeGreaterThan(30);
      expect(entries.length).toBe(1);
      expect(entries[0].msg).toBe('query completed');
      expect(entries[0].durationMs).toBeGreaterThan(0);
    });
  });

  describe('Level Management', () => {
    it('should allow changing log level at runtime', () => {
      const entries: LogEntry[] = [];
      const logger = createLogger({
        level: 'error',
        destination: { write: (e) => entries.push(e) },
      });

      logger.info('should not appear');
      expect(entries.length).toBe(0);

      logger.setLevel('info');
      logger.info('should appear');
      expect(entries.length).toBe(1);
    });

    it('should check if level is enabled', () => {
      const logger = createLogger({ level: 'warn' });

      expect(logger.isLevelEnabled('debug')).toBe(false);
      expect(logger.isLevelEnabled('info')).toBe(false);
      expect(logger.isLevelEnabled('warn')).toBe(true);
      expect(logger.isLevelEnabled('error')).toBe(true);
    });

    it('should return current level', () => {
      const logger = createLogger({ level: 'debug' });
      expect(logger.getLevel()).toBe('debug');
    });
  });
});

describe('Metrics', () => {
  describe('createMetrics', () => {
    it('should create a metrics instance', () => {
      const metrics = createMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.increment).toBeDefined();
      expect(metrics.gauge).toBeDefined();
      expect(metrics.observe).toBeDefined();
      expect(metrics.startTimer).toBeDefined();
      expect(metrics.snapshot).toBeDefined();
    });
  });

  describe('Counters', () => {
    it('should increment counter', () => {
      const metrics = createMetrics();

      metrics.increment('test.counter');
      metrics.increment('test.counter');
      metrics.increment('test.counter', 5);

      expect(metrics.getCounter('test.counter')).toBe(7);
    });

    it('should support labeled counters', () => {
      const metrics = createMetrics();

      metrics.increment('signals.ingested', 3, { domain: 'engineering' });
      metrics.increment('signals.ingested', 2, { domain: 'finance' });
      metrics.increment('signals.ingested', 1, { domain: 'engineering' });

      expect(metrics.getCounter('signals.ingested', { domain: 'engineering' })).toBe(4);
      expect(metrics.getCounter('signals.ingested', { domain: 'finance' })).toBe(2);
    });

    it('should return 0 for unknown counter', () => {
      const metrics = createMetrics();
      expect(metrics.getCounter('unknown')).toBe(0);
    });
  });

  describe('Gauges', () => {
    it('should set gauge value', () => {
      const metrics = createMetrics();

      metrics.gauge('active.entities', 42);
      expect(metrics.getGauge('active.entities')).toBe(42);

      metrics.gauge('active.entities', 50);
      expect(metrics.getGauge('active.entities')).toBe(50);
    });

    it('should support labeled gauges', () => {
      const metrics = createMetrics();

      metrics.gauge('queue.size', 10, { type: 'causal' });
      metrics.gauge('queue.size', 5, { type: 'pattern' });

      expect(metrics.getGauge('queue.size', { type: 'causal' })).toBe(10);
      expect(metrics.getGauge('queue.size', { type: 'pattern' })).toBe(5);
    });
  });

  describe('Histograms', () => {
    it('should record histogram observations', () => {
      const metrics = createMetrics();

      metrics.observe('query.latency', 10);
      metrics.observe('query.latency', 20);
      metrics.observe('query.latency', 15);
      metrics.observe('query.latency', 30);
      metrics.observe('query.latency', 5);

      const hist = metrics.getHistogram('query.latency');
      expect(hist).not.toBeNull();
      expect(hist!.count).toBe(5);
      expect(hist!.min).toBe(5);
      expect(hist!.max).toBe(30);
      expect(hist!.avg).toBe(16);
      expect(hist!.p50).toBeDefined();
      expect(hist!.p90).toBeDefined();
      expect(hist!.p95).toBeDefined();
      expect(hist!.p99).toBeDefined();
    });

    it('should return null for unknown histogram', () => {
      const metrics = createMetrics();
      expect(metrics.getHistogram('unknown')).toBeNull();
    });
  });

  describe('Timers', () => {
    it('should measure duration via timer', async () => {
      const metrics = createMetrics();

      const stop = metrics.startTimer('operation.duration');
      await new Promise(r => setTimeout(r, 50));
      const elapsed = stop();

      expect(elapsed).toBeGreaterThan(30);

      const hist = metrics.getHistogram('operation.duration');
      expect(hist).not.toBeNull();
      expect(hist!.count).toBe(1);
      expect(hist!.avg).toBeGreaterThan(30);
    });
  });

  describe('Snapshots', () => {
    it('should produce a complete snapshot', () => {
      const metrics = createMetrics();

      metrics.increment('counter.a', 5);
      metrics.gauge('gauge.b', 42);
      metrics.observe('hist.c', 10);
      metrics.observe('hist.c', 20);

      const snap = metrics.snapshot();

      expect(snap.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(snap.uptime_ms).toBeGreaterThanOrEqual(0);
      expect(snap.metrics.length).toBe(3);

      const counter = snap.metrics.find(m => m.name === 'counter.a');
      expect(counter).toBeDefined();
      expect(counter!.type).toBe('counter');
      expect((counter as any).value).toBe(5);

      const gauge = snap.metrics.find(m => m.name === 'gauge.b');
      expect(gauge).toBeDefined();
      expect(gauge!.type).toBe('gauge');

      const hist = snap.metrics.find(m => m.name === 'hist.c');
      expect(hist).toBeDefined();
      expect(hist!.type).toBe('histogram');
      expect((hist as any).count).toBe(2);
    });
  });

  describe('Reset', () => {
    it('should clear all metrics', () => {
      const metrics = createMetrics();

      metrics.increment('test', 10);
      metrics.gauge('test.g', 42);
      metrics.observe('test.h', 5);

      metrics.reset();

      expect(metrics.getCounter('test')).toBe(0);
      expect(metrics.getGauge('test.g')).toBe(0);
      expect(metrics.getHistogram('test.h')).toBeNull();
      expect(metrics.snapshot().metrics.length).toBe(0);
    });
  });
});
