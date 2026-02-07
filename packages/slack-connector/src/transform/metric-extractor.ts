/**
 * Metric Extractor
 *
 * Extracts numeric metric observations from Slack data
 * for feeding into memory-stack's anomaly detection.
 */

import type {
  SlackWorkspaceData,
  MetricObservation,
  DailyChannelMetrics,
} from '../types';
import { analyzeSentiment } from './sentiment-analyzer';

/**
 * Extract per-channel metric observations for anomaly detection
 */
export function extractChannelMetrics(
  data: SlackWorkspaceData
): MetricObservation[] {
  const observations: MetricObservation[] = [];

  for (const channel of data.channels) {
    const channelMessages = data.messages.filter((m) => m.channel === channel.id);
    if (channelMessages.length === 0) continue;

    const uniqueUsers = new Set(channelMessages.map((m) => m.user).filter(Boolean));
    const totalReactions = channelMessages.reduce(
      (sum, m) => sum + (m.reactions?.reduce((s, r) => s + r.count, 0) ?? 0),
      0
    );
    const threadsCount = channelMessages.filter(
      (m) => m.reply_count && m.reply_count > 0
    ).length;
    const avgLength =
      channelMessages.reduce((sum, m) => sum + m.text.length, 0) /
      channelMessages.length;

    observations.push(
      {
        entityId: channel.id,
        entityType: 'channel',
        metricName: 'message_count',
        value: channelMessages.length,
      },
      {
        entityId: channel.id,
        entityType: 'channel',
        metricName: 'unique_participants',
        value: uniqueUsers.size,
      },
      {
        entityId: channel.id,
        entityType: 'channel',
        metricName: 'avg_message_length',
        value: avgLength,
      },
      {
        entityId: channel.id,
        entityType: 'channel',
        metricName: 'reaction_rate',
        value:
          channelMessages.length > 0
            ? totalReactions / channelMessages.length
            : 0,
      },
      {
        entityId: channel.id,
        entityType: 'channel',
        metricName: 'thread_ratio',
        value:
          channelMessages.length > 0
            ? threadsCount / channelMessages.length
            : 0,
      }
    );
  }

  return observations;
}

/**
 * Extract per-user metric observations
 */
export function extractUserMetrics(
  data: SlackWorkspaceData
): MetricObservation[] {
  const observations: MetricObservation[] = [];
  const userMessages = new Map<string, { channels: Set<string>; count: number; threads: number }>();

  for (const msg of data.messages) {
    if (!msg.user) continue;

    if (!userMessages.has(msg.user)) {
      userMessages.set(msg.user, { channels: new Set(), count: 0, threads: 0 });
    }

    const entry = userMessages.get(msg.user)!;
    entry.count++;
    entry.channels.add(msg.channel);
    if (msg.reply_count && msg.reply_count > 0) {
      entry.threads++;
    }
  }

  for (const [userId, stats] of userMessages) {
    observations.push(
      {
        entityId: userId,
        entityType: 'user',
        metricName: 'messages_sent',
        value: stats.count,
      },
      {
        entityId: userId,
        entityType: 'user',
        metricName: 'channels_active_in',
        value: stats.channels.size,
      },
      {
        entityId: userId,
        entityType: 'user',
        metricName: 'threads_initiated',
        value: stats.threads,
      }
    );
  }

  return observations;
}

/**
 * Compute daily aggregated metrics per channel for time-series analysis
 */
export function computeDailyMetrics(
  data: SlackWorkspaceData
): DailyChannelMetrics[] {
  const dailyMap = new Map<string, DailyChannelMetrics>();

  for (const msg of data.messages) {
    // Convert Slack timestamp (seconds.microseconds) to date
    const date = new Date(parseFloat(msg.ts) * 1000).toISOString().split('T')[0];
    const key = `${msg.channel}:${date}`;

    if (!dailyMap.has(key)) {
      dailyMap.set(key, {
        channelId: msg.channel,
        date,
        messageCount: 0,
        uniqueUsers: 0,
        reactionCount: 0,
        threadCount: 0,
        avgSentiment: 0,
      });
    }

    const entry = dailyMap.get(key)!;
    entry.messageCount++;
    entry.reactionCount += msg.reactions?.reduce((s, r) => s + r.count, 0) ?? 0;
    if (msg.reply_count && msg.reply_count > 0) entry.threadCount++;
  }

  // Second pass: compute unique users and sentiment per day
  const dayUsers = new Map<string, Set<string>>();
  const daySentiment = new Map<string, number[]>();

  for (const msg of data.messages) {
    const date = new Date(parseFloat(msg.ts) * 1000).toISOString().split('T')[0];
    const key = `${msg.channel}:${date}`;

    if (!dayUsers.has(key)) dayUsers.set(key, new Set());
    if (msg.user) dayUsers.get(key)!.add(msg.user);

    if (!daySentiment.has(key)) daySentiment.set(key, []);
    const sentiment = analyzeSentiment(msg.text);
    daySentiment.get(key)!.push(sentiment.score);
  }

  for (const [key, entry] of dailyMap) {
    entry.uniqueUsers = dayUsers.get(key)?.size ?? 0;
    const scores = daySentiment.get(key) ?? [];
    entry.avgSentiment =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  return [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
}
