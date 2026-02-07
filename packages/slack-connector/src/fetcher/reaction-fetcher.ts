/**
 * Reaction Aggregator
 *
 * Aggregates reaction data from messages (reactions are already included
 * in message objects, so no additional API calls are needed).
 */

import type { SlackMessage, SlackReaction } from '../types';

export interface ReactionSummary {
  channelId: string;
  totalReactions: number;
  uniqueEmojis: number;
  topEmojis: Array<{ name: string; count: number }>;
  messagesWithReactions: number;
  reactionRate: number;
}

/**
 * Aggregate reaction data per channel from fetched messages
 */
export function aggregateReactions(
  messages: SlackMessage[],
  channelIds: string[]
): Map<string, ReactionSummary> {
  const summaries = new Map<string, ReactionSummary>();

  for (const channelId of channelIds) {
    const channelMessages = messages.filter((m) => m.channel === channelId);
    const emojiCounts = new Map<string, number>();
    let totalReactions = 0;
    let messagesWithReactions = 0;

    for (const msg of channelMessages) {
      if (msg.reactions && msg.reactions.length > 0) {
        messagesWithReactions++;
        for (const reaction of msg.reactions) {
          totalReactions += reaction.count;
          emojiCounts.set(
            reaction.name,
            (emojiCounts.get(reaction.name) ?? 0) + reaction.count
          );
        }
      }
    }

    const topEmojis = [...emojiCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    summaries.set(channelId, {
      channelId,
      totalReactions,
      uniqueEmojis: emojiCounts.size,
      topEmojis,
      messagesWithReactions,
      reactionRate:
        channelMessages.length > 0
          ? messagesWithReactions / channelMessages.length
          : 0,
    });
  }

  return summaries;
}
