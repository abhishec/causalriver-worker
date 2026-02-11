/**
 * Message Fetcher
 *
 * Fetches messages and threads from Slack channels.
 */

import type { SlackClient } from '../client/slack-client';
import type { SlackChannel, SlackMessage } from '../types';

/**
 * Fetch messages from all given channels, optionally including thread replies
 */
export async function fetchMessages(
  client: SlackClient,
  channels: SlackChannel[],
  lookbackDays: number,
  includeThreads: boolean
): Promise<{ messages: SlackMessage[]; threads: Map<string, SlackMessage[]> }> {
  const oldestTimestamp = String((Date.now() - lookbackDays * 86_400_000) / 1000);
  const allMessages: SlackMessage[] = [];
  const threads = new Map<string, SlackMessage[]>();

  for (const channel of channels) {
    const raw = await client.getChannelHistory(channel.id, oldestTimestamp);

    const channelMessages: SlackMessage[] = raw
      .filter((msg: any) => msg.type === 'message' && !msg.subtype)
      .map((msg: any) => ({
        ts: msg.ts,
        user: msg.user,
        text: msg.text ?? '',
        thread_ts: msg.thread_ts,
        reply_count: msg.reply_count,
        reply_users_count: msg.reply_users_count,
        reactions: msg.reactions,
        channel: channel.id,
        type: msg.type,
        subtype: msg.subtype,
      }));

    allMessages.push(...channelMessages);

    // Fetch thread replies if requested
    if (includeThreads) {
      const threadParents = channelMessages.filter(
        (m) => m.reply_count && m.reply_count > 0
      );

      for (const parent of threadParents) {
        const replies = await client.getThreadReplies(channel.id, parent.ts);
        if (replies.length > 0) {
          threads.set(
            parent.ts,
            replies.map((r: any) => ({
              ts: r.ts,
              user: r.user,
              text: r.text ?? '',
              thread_ts: r.thread_ts,
              reply_count: r.reply_count,
              reply_users_count: r.reply_users_count,
              reactions: r.reactions,
              channel: channel.id,
              type: r.type ?? 'message',
              subtype: r.subtype,
            }))
          );
        }
      }
    }
  }

  return { messages: allMessages, threads };
}
