/**
 * Slack Analyzer - Main Orchestrator
 *
 * Coordinates all memory-stack engines to produce comprehensive
 * workspace insights from Slack data.
 */

import {
  detectAnomalies,
  discoverPatterns,
} from '@nexus-ai/memory-stack';
import {
  signalsToTimeSeries,
  testAllPairs,
  type GrangerResult,
} from '@nexus-ai/memory-stack/causality';

import type { SlackWorkspaceData, SlackInsights, CausalRelationship } from '../types';
import { extractChannelMetrics, computeDailyMetrics } from '../transform/metric-extractor';
import { computeChannelMetrics } from './channel-insights';
import {
  buildCommunicationGraph,
  computeSentimentTrends,
} from './communication-patterns';

/**
 * Run full analysis on fetched Slack workspace data
 */
export function analyzeWorkspace(data: SlackWorkspaceData): SlackInsights {
  // 1. Anomaly detection on channel metrics
  const observations = extractChannelMetrics(data);
  const rawAnomalies = detectAnomalies(observations, { method: 'auto' });

  const channelNameMap = new Map(
    data.channels.map((ch) => [ch.id, ch.name])
  );

  const anomalies = rawAnomalies.map((a) => ({
    channelId: a.entityId,
    channelName: channelNameMap.get(a.entityId) ?? a.entityId,
    metricName: a.metricName,
    observedValue: a.observedValue,
    expectedValue: a.expectedValue,
    zScore: a.zScore,
    severity: a.severity,
    explanation: a.explanation,
    detectedAt: a.detectedAt,
  }));

  // 2. Pattern discovery via association rules
  const transactions = buildTransactions(data);
  const { rules } = discoverPatterns(transactions, [], {
    minSupport: 0.05,
    minConfidence: 0.5,
    minLift: 1.2,
  });

  const patterns = rules.map((r) => ({
    antecedent: r.antecedent,
    consequent: r.consequent,
    support: r.support,
    confidence: r.confidence,
    lift: r.lift,
  }));

  // 3. Causal discovery via Granger causality
  const causalRelationships = discoverCausalRelationships(data, channelNameMap);

  // 4. Channel metrics
  const channelMetrics = computeChannelMetrics(data);

  // 5. Communication graph
  const communicationGraph = buildCommunicationGraph(data);

  // 6. Sentiment trends
  const sentimentTrends = computeSentimentTrends(data);

  // 7. Summary
  const responseTimes = channelMetrics
    .map((m) => m.avgResponseTimeMinutes)
    .filter((t): t is number => t !== null);
  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null;

  const hourCounts = new Map<number, number>();
  for (const msg of data.messages) {
    const hour = new Date(parseFloat(msg.ts) * 1000).getUTCHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }
  const mostActiveHours = [...hourCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => hour);

  const summary = {
    totalChannels: data.channels.length,
    totalMessages: data.messages.length,
    totalUsers: data.users.length,
    avgResponseTimeMinutes: avgResponseTime,
    mostActiveChannels: channelMetrics.slice(0, 5).map((m) => m.channelName),
    mostActiveHours,
    quietChannels: channelMetrics
      .filter((m) => m.messageCount < 10)
      .map((m) => m.channelName),
  };

  return {
    anomalies,
    patterns,
    causalRelationships,
    channelMetrics,
    communicationGraph,
    sentimentTrends,
    summary,
  };
}

/**
 * Build transaction arrays for association rule mining.
 * Each transaction represents a channel's characteristics.
 */
function buildTransactions(data: SlackWorkspaceData): string[][] {
  const transactions: string[][] = [];

  for (const channel of data.channels) {
    const msgs = data.messages.filter((m) => m.channel === channel.id);
    if (msgs.length === 0) continue;

    const items: string[] = [];
    const uniqueUsers = new Set(msgs.map((m) => m.user).filter(Boolean)).size;
    const threadRatio =
      msgs.filter((m) => m.reply_count && m.reply_count > 0).length / msgs.length;
    const reactionMsgs = msgs.filter(
      (m) => m.reactions && m.reactions.length > 0
    ).length;

    // Volume bucket
    if (msgs.length > 200) items.push('high_volume');
    else if (msgs.length > 50) items.push('medium_volume');
    else items.push('low_volume');

    // Participation bucket
    if (uniqueUsers > 15) items.push('high_participation');
    else if (uniqueUsers > 5) items.push('medium_participation');
    else items.push('low_participation');

    // Thread engagement
    if (threadRatio > 0.3) items.push('high_thread_engagement');
    else if (threadRatio > 0.1) items.push('medium_thread_engagement');
    else items.push('low_thread_engagement');

    // Reaction engagement
    const reactionRate = reactionMsgs / msgs.length;
    if (reactionRate > 0.3) items.push('high_reactions');
    else if (reactionRate > 0.1) items.push('medium_reactions');
    else items.push('low_reactions');

    // Channel type
    if (channel.is_private) items.push('private_channel');
    else items.push('public_channel');

    transactions.push(items);
  }

  return transactions;
}

/**
 * Discover causal relationships between channels using Granger causality
 * on daily message volume time series.
 */
function discoverCausalRelationships(
  data: SlackWorkspaceData,
  channelNameMap: Map<string, string>
): CausalRelationship[] {
  const dailyMetrics = computeDailyMetrics(data);

  if (dailyMetrics.length === 0) return [];

  // Convert daily metrics to RawSignal format for signalsToTimeSeries
  const rawSignals = dailyMetrics.map((dm) => ({
    organization_id: 'workspace',
    source_domain: dm.channelId,
    signal_type: 'daily_volume',
    signal_value: dm.messageCount,
    signal_timestamp: dm.date,
  }));

  // Convert to aligned time series
  const timeSeriesMap = signalsToTimeSeries(rawSignals, {
    aggregation: 'sum',
    fillMethod: 'zero',
    minDays: 14,
    signalTypes: null,
  });

  // Build record for testAllPairs
  const seriesRecord: Record<string, number[]> = {};
  for (const [domain, series] of timeSeriesMap) {
    seriesRecord[domain] = series.values;
  }

  // Need at least 2 domains to test
  if (Object.keys(seriesRecord).length < 2) return [];

  const results = testAllPairs(seriesRecord, {
    maxLag: 7,
    alpha: 0.05,
    minObservations: 14,
  });

  return results
    .filter((r: GrangerResult) => r.isSignificant)
    .map((r: GrangerResult) => ({
      source: channelNameMap.get(r.sourceDomain) ?? r.sourceDomain,
      target: channelNameMap.get(r.targetDomain) ?? r.targetDomain,
      fStatistic: r.fStatistic,
      pValue: r.pValue,
      lagDays: r.optimalLag,
      isSignificant: r.isSignificant,
      effectSize: r.effectSize,
      interpretation: r.naturalLanguage,
    }));
}
