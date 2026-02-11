import { describe, it, expect } from 'vitest';
import { analyzeWorkspace } from '../analyzer/slack-analyzer';
import { mockWorkspaceData } from './helpers/mock-slack-api';

describe('analyzeWorkspace', () => {
  // Use enough data for meaningful analysis
  const data = mockWorkspaceData({
    channelCount: 4,
    messagesPerChannel: 40,
    userCount: 8,
    withThreads: true,
    withReactions: true,
  });

  it('returns complete SlackInsights structure', () => {
    const insights = analyzeWorkspace(data);

    expect(insights).toHaveProperty('anomalies');
    expect(insights).toHaveProperty('patterns');
    expect(insights).toHaveProperty('causalRelationships');
    expect(insights).toHaveProperty('channelMetrics');
    expect(insights).toHaveProperty('communicationGraph');
    expect(insights).toHaveProperty('sentimentTrends');
    expect(insights).toHaveProperty('summary');
  });

  it('anomalies have expected shape', () => {
    const insights = analyzeWorkspace(data);
    for (const anomaly of insights.anomalies) {
      expect(anomaly).toHaveProperty('channelId');
      expect(anomaly).toHaveProperty('channelName');
      expect(anomaly).toHaveProperty('metricName');
      expect(anomaly).toHaveProperty('severity');
      expect(anomaly).toHaveProperty('explanation');
    }
  });

  it('channelMetrics are sorted by activityScore descending', () => {
    const insights = analyzeWorkspace(data);
    for (let i = 1; i < insights.channelMetrics.length; i++) {
      expect(insights.channelMetrics[i].activityScore).toBeLessThanOrEqual(
        insights.channelMetrics[i - 1].activityScore
      );
    }
  });

  it('summary contains correct totals', () => {
    const insights = analyzeWorkspace(data);
    expect(insights.summary.totalChannels).toBe(data.channels.length);
    expect(insights.summary.totalMessages).toBe(data.messages.length);
    expect(insights.summary.totalUsers).toBe(data.users.length);
  });

  it('summary has mostActiveChannels', () => {
    const insights = analyzeWorkspace(data);
    expect(insights.summary.mostActiveChannels.length).toBeGreaterThan(0);
    expect(insights.summary.mostActiveChannels.length).toBeLessThanOrEqual(5);
  });

  it('communicationGraph has nodes and edges', () => {
    const insights = analyzeWorkspace(data);
    expect(insights.communicationGraph.nodes.length).toBeGreaterThan(0);
    expect(insights.communicationGraph.edges.length).toBeGreaterThan(0);
  });

  it('sentimentTrends have valid ratios', () => {
    const insights = analyzeWorkspace(data);
    for (const trend of insights.sentimentTrends) {
      const sum = trend.positiveRatio + trend.neutralRatio + trend.negativeRatio;
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('patterns have association rule structure', () => {
    const insights = analyzeWorkspace(data);
    for (const pattern of insights.patterns) {
      expect(pattern.antecedent).toBeInstanceOf(Array);
      expect(pattern.consequent).toBeInstanceOf(Array);
      expect(pattern.support).toBeGreaterThanOrEqual(0);
      expect(pattern.confidence).toBeGreaterThanOrEqual(0);
      expect(pattern.lift).toBeGreaterThanOrEqual(0);
    }
  });

  it('causal relationships have expected shape', () => {
    const insights = analyzeWorkspace(data);
    for (const rel of insights.causalRelationships) {
      expect(rel).toHaveProperty('source');
      expect(rel).toHaveProperty('target');
      expect(rel).toHaveProperty('pValue');
      expect(rel).toHaveProperty('lagDays');
      expect(rel.isSignificant).toBe(true);
    }
  });
});
