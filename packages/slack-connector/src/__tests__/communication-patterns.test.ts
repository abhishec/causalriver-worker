import { describe, it, expect } from 'vitest';
import {
  buildCommunicationGraph,
  computeSentimentTrends,
} from '../analyzer/communication-patterns';
import { mockWorkspaceData } from './helpers/mock-slack-api';

describe('buildCommunicationGraph', () => {
  const data = mockWorkspaceData({
    channelCount: 2,
    messagesPerChannel: 20,
    userCount: 5,
    withThreads: true,
  });

  it('creates nodes for active users', () => {
    const graph = buildCommunicationGraph(data);
    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  it('nodes have expected properties', () => {
    const graph = buildCommunicationGraph(data);
    for (const node of graph.nodes) {
      expect(node.userId).toBeDefined();
      expect(node.userName).toBeDefined();
      expect(node.messageCount).toBeGreaterThan(0);
      expect(node.channelCount).toBeGreaterThan(0);
    }
  });

  it('creates edges from thread interactions', () => {
    const graph = buildCommunicationGraph(data);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it('edges have positive weight', () => {
    const graph = buildCommunicationGraph(data);
    for (const edge of graph.edges) {
      expect(edge.weight).toBeGreaterThan(0);
      expect(edge.channels.length).toBeGreaterThan(0);
    }
  });

  it('edges are sorted by weight descending', () => {
    const graph = buildCommunicationGraph(data);
    for (let i = 1; i < graph.edges.length; i++) {
      expect(graph.edges[i].weight).toBeLessThanOrEqual(graph.edges[i - 1].weight);
    }
  });
});

describe('computeSentimentTrends', () => {
  const data = mockWorkspaceData({
    channelCount: 2,
    messagesPerChannel: 30,
  });

  it('returns daily sentiment buckets', () => {
    const trends = computeSentimentTrends(data);
    expect(trends.length).toBeGreaterThan(0);
  });

  it('ratios sum to approximately 1', () => {
    const trends = computeSentimentTrends(data);
    for (const trend of trends) {
      const sum = trend.positiveRatio + trend.neutralRatio + trend.negativeRatio;
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('is sorted by date', () => {
    const trends = computeSentimentTrends(data);
    for (let i = 1; i < trends.length; i++) {
      expect(trends[i].date >= trends[i - 1].date).toBe(true);
    }
  });

  it('can filter by channelId', () => {
    const trends = computeSentimentTrends(data, data.channels[0].id);
    for (const trend of trends) {
      expect(trend.channelId).toBe(data.channels[0].id);
    }
  });
});
