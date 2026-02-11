import { describe, it, expect } from 'vitest';
import {
  extractChannelMetrics,
  extractUserMetrics,
  computeDailyMetrics,
} from '../transform/metric-extractor';
import { mockWorkspaceData } from './helpers/mock-slack-api';

describe('extractChannelMetrics', () => {
  const data = mockWorkspaceData({ channelCount: 2, messagesPerChannel: 15 });

  it('extracts metrics for each channel', () => {
    const metrics = extractChannelMetrics(data);
    const channelIds = new Set(metrics.map((m) => m.entityId));
    expect(channelIds.size).toBe(2);
  });

  it('includes expected metric names', () => {
    const metrics = extractChannelMetrics(data);
    const metricNames = new Set(metrics.map((m) => m.metricName));
    expect(metricNames).toContain('message_count');
    expect(metricNames).toContain('unique_participants');
    expect(metricNames).toContain('avg_message_length');
    expect(metricNames).toContain('reaction_rate');
    expect(metricNames).toContain('thread_ratio');
  });

  it('message_count values are positive', () => {
    const metrics = extractChannelMetrics(data);
    const msgCounts = metrics.filter((m) => m.metricName === 'message_count');
    for (const m of msgCounts) {
      expect(m.value).toBeGreaterThan(0);
    }
  });

  it('all metrics have entityType = channel', () => {
    const metrics = extractChannelMetrics(data);
    for (const m of metrics) {
      expect(m.entityType).toBe('channel');
    }
  });
});

describe('extractUserMetrics', () => {
  const data = mockWorkspaceData({ userCount: 4, messagesPerChannel: 20 });

  it('extracts metrics for users', () => {
    const metrics = extractUserMetrics(data);
    expect(metrics.length).toBeGreaterThan(0);
  });

  it('includes messages_sent metric', () => {
    const metrics = extractUserMetrics(data);
    const msgMetrics = metrics.filter((m) => m.metricName === 'messages_sent');
    expect(msgMetrics.length).toBeGreaterThan(0);
    for (const m of msgMetrics) {
      expect(m.value).toBeGreaterThan(0);
    }
  });

  it('all metrics have entityType = user', () => {
    const metrics = extractUserMetrics(data);
    for (const m of metrics) {
      expect(m.entityType).toBe('user');
    }
  });
});

describe('computeDailyMetrics', () => {
  const data = mockWorkspaceData({ channelCount: 2, messagesPerChannel: 30 });

  it('returns daily aggregated metrics', () => {
    const daily = computeDailyMetrics(data);
    expect(daily.length).toBeGreaterThan(0);
  });

  it('each entry has required fields', () => {
    const daily = computeDailyMetrics(data);
    for (const entry of daily) {
      expect(entry.channelId).toBeDefined();
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.messageCount).toBeGreaterThanOrEqual(0);
      expect(typeof entry.avgSentiment).toBe('number');
    }
  });

  it('is sorted by date', () => {
    const daily = computeDailyMetrics(data);
    for (let i = 1; i < daily.length; i++) {
      expect(daily[i].date >= daily[i - 1].date).toBe(true);
    }
  });
});
