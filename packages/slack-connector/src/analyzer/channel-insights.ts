/**
 * Channel Insights
 *
 * Computes per-channel activity metrics and rankings.
 */

import type { SlackWorkspaceData, ChannelMetrics } from '../types';

/**
 * Compute comprehensive metrics for each channel
 */
export function computeChannelMetrics(
  data: SlackWorkspaceData
): ChannelMetrics[] {
  const metrics: ChannelMetrics[] = [];

  for (const channel of data.channels) {
    const msgs = data.messages.filter((m) => m.channel === channel.id);
    if (msgs.length === 0) {
      metrics.push({
        channelId: channel.id,
        channelName: channel.name,
        messageCount: 0,
        uniqueParticipants: 0,
        threadCount: 0,
        avgThreadDepth: 0,
        reactionCount: 0,
        reactionRate: 0,
        avgResponseTimeMinutes: null,
        activityScore: 0,
      });
      continue;
    }

    const uniqueUsers = new Set(msgs.map((m) => m.user).filter(Boolean));
    const threaded = msgs.filter((m) => m.reply_count && m.reply_count > 0);
    const avgThreadDepth =
      threaded.length > 0
        ? threaded.reduce((s, m) => s + (m.reply_count ?? 0), 0) / threaded.length
        : 0;

    let totalReactions = 0;
    let msgsWithReactions = 0;
    for (const msg of msgs) {
      if (msg.reactions && msg.reactions.length > 0) {
        msgsWithReactions++;
        totalReactions += msg.reactions.reduce((s, r) => s + r.count, 0);
      }
    }

    // Compute average response time from threads
    let avgResponseTimeMinutes: number | null = null;
    const responseTimes: number[] = [];
    for (const parent of threaded) {
      const replies = data.threads.get(parent.ts);
      if (replies && replies.length > 0) {
        const responseMin =
          (parseFloat(replies[0].ts) - parseFloat(parent.ts)) / 60;
        if (responseMin > 0 && responseMin < 1440) {
          responseTimes.push(responseMin);
        }
      }
    }
    if (responseTimes.length > 0) {
      avgResponseTimeMinutes =
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    }

    // Activity score: weighted combination
    const volumeScore = Math.min(1, msgs.length / 200);
    const participationScore = Math.min(1, uniqueUsers.size / 20);
    const threadScore = Math.min(1, threaded.length / msgs.length);
    const reactionScore = Math.min(1, totalReactions / msgs.length);
    const activityScore =
      volumeScore * 0.3 +
      participationScore * 0.3 +
      threadScore * 0.2 +
      reactionScore * 0.2;

    metrics.push({
      channelId: channel.id,
      channelName: channel.name,
      messageCount: msgs.length,
      uniqueParticipants: uniqueUsers.size,
      threadCount: threaded.length,
      avgThreadDepth,
      reactionCount: totalReactions,
      reactionRate: msgsWithReactions / msgs.length,
      avgResponseTimeMinutes,
      activityScore,
    });
  }

  return metrics.sort((a, b) => b.activityScore - a.activityScore);
}
