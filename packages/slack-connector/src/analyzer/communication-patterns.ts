/**
 * Communication Patterns
 *
 * Builds user interaction graphs and computes sentiment trends.
 */

import type {
  SlackWorkspaceData,
  UserInteractionGraph,
  UserNode,
  InteractionEdge,
  SentimentTrend,
} from '../types';
import { analyzeSentiment } from '../transform/sentiment-analyzer';

/**
 * Build a graph of user-to-user interactions based on thread participation
 */
export function buildCommunicationGraph(
  data: SlackWorkspaceData
): UserInteractionGraph {
  // Build user nodes
  const userMsgCounts = new Map<string, { count: number; channels: Set<string> }>();

  for (const msg of data.messages) {
    if (!msg.user) continue;
    if (!userMsgCounts.has(msg.user)) {
      userMsgCounts.set(msg.user, { count: 0, channels: new Set() });
    }
    const entry = userMsgCounts.get(msg.user)!;
    entry.count++;
    entry.channels.add(msg.channel);
  }

  const userNameMap = new Map(data.users.map((u) => [u.id, u.real_name ?? u.name]));

  const nodes: UserNode[] = [...userMsgCounts.entries()].map(([userId, stats]) => ({
    userId,
    userName: userNameMap.get(userId) ?? userId,
    messageCount: stats.count,
    channelCount: stats.channels.size,
  }));

  // Build edges from thread interactions
  const edgeMap = new Map<string, { weight: number; channels: Set<string> }>();

  for (const [threadTs, replies] of data.threads) {
    // Find parent message to get the thread starter
    const parent = data.messages.find((m) => m.ts === threadTs);
    if (!parent?.user) continue;

    const participants = new Set<string>();
    participants.add(parent.user);
    for (const reply of replies) {
      if (reply.user) participants.add(reply.user);
    }

    // Create edges between all participants in this thread
    const users = [...participants];
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const key = [users[i], users[j]].sort().join(':');
        if (!edgeMap.has(key)) {
          edgeMap.set(key, { weight: 0, channels: new Set() });
        }
        const edge = edgeMap.get(key)!;
        edge.weight++;
        edge.channels.add(parent.channel);
      }
    }
  }

  const edges: InteractionEdge[] = [...edgeMap.entries()].map(([key, data]) => {
    const [from, to] = key.split(':');
    return { from, to, weight: data.weight, channels: [...data.channels] };
  });

  return { nodes, edges: edges.sort((a, b) => b.weight - a.weight) };
}

/**
 * Compute sentiment trends over time (daily buckets)
 */
export function computeSentimentTrends(
  data: SlackWorkspaceData,
  channelId?: string
): SentimentTrend[] {
  const dailyBuckets = new Map<
    string,
    { positive: number; neutral: number; negative: number; total: number }
  >();

  const msgs = channelId
    ? data.messages.filter((m) => m.channel === channelId)
    : data.messages;

  for (const msg of msgs) {
    const date = new Date(parseFloat(msg.ts) * 1000).toISOString().split('T')[0];

    if (!dailyBuckets.has(date)) {
      dailyBuckets.set(date, { positive: 0, neutral: 0, negative: 0, total: 0 });
    }

    const bucket = dailyBuckets.get(date)!;
    const sentiment = analyzeSentiment(
      msg.text,
      msg.reactions?.map((r) => r.name)
    );

    bucket.total++;
    if (sentiment.label === 'positive') bucket.positive++;
    else if (sentiment.label === 'negative') bucket.negative++;
    else bucket.neutral++;
  }

  return [...dailyBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      positiveRatio: bucket.total > 0 ? bucket.positive / bucket.total : 0,
      neutralRatio: bucket.total > 0 ? bucket.neutral / bucket.total : 0,
      negativeRatio: bucket.total > 0 ? bucket.negative / bucket.total : 0,
      messageCount: bucket.total,
      channelId,
    }));
}
