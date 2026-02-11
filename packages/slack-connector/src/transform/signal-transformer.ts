/**
 * Signal Transformer
 *
 * Transforms Slack workspace data into CrossDomainSignal[] compatible
 * with @nexus-ai/memory-stack's signal collector framework.
 *
 * This is the KEY integration point between Slack data and the
 * causal intelligence engine.
 */

import {
  createSignalBuilder,
  normalizeSignalValue,
  type CrossDomainSignal,
} from '@nexus-ai/memory-stack';
import type { SlackWorkspaceData } from '../types';
import { analyzeSentiment } from './sentiment-analyzer';

/**
 * Transform Slack workspace data into CrossDomainSignal array
 */
export function transformToSignals(
  data: SlackWorkspaceData,
  lookbackDays: number = 90
): CrossDomainSignal[] {
  const signals: CrossDomainSignal[] = [];
  const builder = createSignalBuilder('slack');

  // 1. Message volume signals per channel
  signals.push(...buildMessageVolumeSignals(data, builder, lookbackDays));

  // 2. Response time signals per channel
  signals.push(...buildResponseTimeSignals(data, builder, lookbackDays));

  // 3. Thread engagement signals per channel
  signals.push(...buildThreadEngagementSignals(data, builder, lookbackDays));

  // 4. Reaction density signals per channel
  signals.push(...buildReactionSignals(data, builder, lookbackDays));

  // 5. User activity signals
  signals.push(...buildUserActivitySignals(data, builder, lookbackDays));

  // 6. Sentiment signals per channel
  signals.push(...buildSentimentSignals(data, builder, lookbackDays));

  return signals;
}

function buildMessageVolumeSignals(
  data: SlackWorkspaceData,
  builder: ReturnType<typeof createSignalBuilder>,
  lookbackDays: number
): CrossDomainSignal[] {
  const signals: CrossDomainSignal[] = [];

  for (const channel of data.channels) {
    const msgs = data.messages.filter((m) => m.channel === channel.id);
    if (msgs.length === 0) continue;

    const uniqueUsers = new Set(msgs.map((m) => m.user).filter(Boolean)).size;
    const avgLength = msgs.reduce((s, m) => s + m.text.length, 0) / msgs.length;
    const value = Math.tanh(msgs.length / 100);

    signals.push(
      builder.opportunity({
        type: 'message_volume',
        entityType: 'channel',
        entityId: channel.id,
        value: Math.max(0.01, value),
        features: {
          message_count: msgs.length,
          unique_users: uniqueUsers,
          avg_length: avgLength,
        },
        metadata: { channel_name: channel.name, is_private: channel.is_private },
        lookbackDays,
      })
    );
  }

  return signals;
}

function buildResponseTimeSignals(
  data: SlackWorkspaceData,
  builder: ReturnType<typeof createSignalBuilder>,
  lookbackDays: number
): CrossDomainSignal[] {
  const signals: CrossDomainSignal[] = [];

  for (const channel of data.channels) {
    const threadParents = data.messages.filter(
      (m) => m.channel === channel.id && m.reply_count && m.reply_count > 0
    );

    if (threadParents.length === 0) continue;

    // Compute average response time from thread data
    const responseTimes: number[] = [];
    for (const parent of threadParents) {
      const replies = data.threads.get(parent.ts);
      if (replies && replies.length > 0) {
        const firstReplyTs = parseFloat(replies[0].ts);
        const parentTs = parseFloat(parent.ts);
        const responseMinutes = (firstReplyTs - parentTs) / 60;
        if (responseMinutes > 0 && responseMinutes < 1440) {
          // Cap at 24 hours
          responseTimes.push(responseMinutes);
        }
      }
    }

    if (responseTimes.length === 0) continue;

    const avgResponseMinutes =
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

    // Slow responses are risk signals (> 60 min = negative)
    const normalized = normalizeSignalValue(-(avgResponseMinutes - 60) / 120);

    if (normalized < 0) {
      signals.push(
        builder.risk({
          type: 'response_time',
          entityType: 'channel',
          entityId: channel.id,
          value: normalized,
          features: {
            avg_response_minutes: avgResponseMinutes,
            thread_count: threadParents.length,
            measured_threads: responseTimes.length,
          },
          metadata: { channel_name: channel.name },
          lookbackDays,
        })
      );
    } else {
      signals.push(
        builder.opportunity({
          type: 'response_time',
          entityType: 'channel',
          entityId: channel.id,
          value: normalized,
          features: {
            avg_response_minutes: avgResponseMinutes,
            thread_count: threadParents.length,
            measured_threads: responseTimes.length,
          },
          metadata: { channel_name: channel.name },
          lookbackDays,
        })
      );
    }
  }

  return signals;
}

function buildThreadEngagementSignals(
  data: SlackWorkspaceData,
  builder: ReturnType<typeof createSignalBuilder>,
  lookbackDays: number
): CrossDomainSignal[] {
  const signals: CrossDomainSignal[] = [];

  for (const channel of data.channels) {
    const msgs = data.messages.filter((m) => m.channel === channel.id);
    if (msgs.length === 0) continue;

    const threaded = msgs.filter((m) => m.reply_count && m.reply_count > 0);
    const replyRate = threaded.length / msgs.length;
    const avgDepth =
      threaded.length > 0
        ? threaded.reduce((s, m) => s + (m.reply_count ?? 0), 0) / threaded.length
        : 0;

    const value = Math.tanh(replyRate * 3);

    signals.push(
      builder.opportunity({
        type: 'thread_engagement',
        entityType: 'channel',
        entityId: channel.id,
        value: Math.max(0.01, value),
        features: {
          reply_rate: replyRate,
          avg_thread_depth: avgDepth,
          threads_with_replies: threaded.length,
          total_messages: msgs.length,
        },
        metadata: { channel_name: channel.name },
        lookbackDays,
      })
    );
  }

  return signals;
}

function buildReactionSignals(
  data: SlackWorkspaceData,
  builder: ReturnType<typeof createSignalBuilder>,
  lookbackDays: number
): CrossDomainSignal[] {
  const signals: CrossDomainSignal[] = [];

  for (const channel of data.channels) {
    const msgs = data.messages.filter((m) => m.channel === channel.id);
    if (msgs.length === 0) continue;

    let totalReactions = 0;
    const uniqueEmojis = new Set<string>();
    let msgsWithReactions = 0;

    for (const msg of msgs) {
      if (msg.reactions && msg.reactions.length > 0) {
        msgsWithReactions++;
        for (const r of msg.reactions) {
          totalReactions += r.count;
          uniqueEmojis.add(r.name);
        }
      }
    }

    const reactionsPerMessage = totalReactions / msgs.length;
    const value = Math.tanh(reactionsPerMessage);

    signals.push(
      builder.opportunity({
        type: 'reaction_density',
        entityType: 'channel',
        entityId: channel.id,
        value: Math.max(0.01, value),
        features: {
          reaction_count: totalReactions,
          unique_reactions: uniqueEmojis.size,
          reaction_diversity: uniqueEmojis.size,
          messages_with_reactions: msgsWithReactions,
          reactions_per_message: reactionsPerMessage,
        },
        metadata: { channel_name: channel.name },
        lookbackDays,
      })
    );
  }

  return signals;
}

function buildUserActivitySignals(
  data: SlackWorkspaceData,
  builder: ReturnType<typeof createSignalBuilder>,
  lookbackDays: number
): CrossDomainSignal[] {
  const signals: CrossDomainSignal[] = [];
  const userStats = new Map<
    string,
    { count: number; channels: Set<string>; threads: number }
  >();

  for (const msg of data.messages) {
    if (!msg.user) continue;
    if (!userStats.has(msg.user)) {
      userStats.set(msg.user, { count: 0, channels: new Set(), threads: 0 });
    }
    const stats = userStats.get(msg.user)!;
    stats.count++;
    stats.channels.add(msg.channel);
    if (msg.reply_count && msg.reply_count > 0) stats.threads++;
  }

  for (const [userId, stats] of userStats) {
    const value = Math.tanh(stats.count / 50);

    signals.push(
      builder.opportunity({
        type: 'user_activity',
        entityType: 'user',
        entityId: userId,
        value: Math.max(0.01, value),
        features: {
          messages_sent: stats.count,
          channels_active: stats.channels.size,
          threads_started: stats.threads,
        },
        metadata: {},
        lookbackDays,
      })
    );
  }

  return signals;
}

function buildSentimentSignals(
  data: SlackWorkspaceData,
  builder: ReturnType<typeof createSignalBuilder>,
  lookbackDays: number
): CrossDomainSignal[] {
  const signals: CrossDomainSignal[] = [];

  for (const channel of data.channels) {
    const msgs = data.messages.filter((m) => m.channel === channel.id);
    if (msgs.length === 0) continue;

    let positiveCount = 0;
    let negativeCount = 0;
    let totalScore = 0;

    for (const msg of msgs) {
      const result = analyzeSentiment(
        msg.text,
        msg.reactions?.map((r) => r.name)
      );
      totalScore += result.score;
      if (result.label === 'positive') positiveCount++;
      if (result.label === 'negative') negativeCount++;
    }

    const avgSentiment = totalScore / msgs.length;
    const positiveRatio = positiveCount / msgs.length;
    const negativeRatio = negativeCount / msgs.length;

    if (avgSentiment < -0.1) {
      signals.push(
        builder.risk({
          type: 'sentiment_shift',
          entityType: 'channel',
          entityId: channel.id,
          value: Math.max(-1, avgSentiment),
          features: {
            positive_ratio: positiveRatio,
            negative_ratio: negativeRatio,
            neutral_ratio: 1 - positiveRatio - negativeRatio,
            avg_sentiment: avgSentiment,
            message_count: msgs.length,
          },
          metadata: { channel_name: channel.name },
          lookbackDays,
        })
      );
    } else {
      signals.push(
        builder.opportunity({
          type: 'sentiment_shift',
          entityType: 'channel',
          entityId: channel.id,
          value: Math.max(0.01, avgSentiment),
          features: {
            positive_ratio: positiveRatio,
            negative_ratio: negativeRatio,
            neutral_ratio: 1 - positiveRatio - negativeRatio,
            avg_sentiment: avgSentiment,
            message_count: msgs.length,
          },
          metadata: { channel_name: channel.name },
          lookbackDays,
        })
      );
    }
  }

  return signals;
}
