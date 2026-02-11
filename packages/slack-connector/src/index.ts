/**
 * Nexus Slack Connector
 *
 * Connect your Slack workspace to Nexus Intelligence.
 * Fetch workspace data and transform it into causal insights using
 * Granger causality, anomaly detection, pattern discovery, and embeddings.
 *
 * @example
 * ```typescript
 * import { createSlackConnector } from '@nexus-ai/slack-connector';
 *
 * const connector = createSlackConnector({
 *   token: process.env.SLACK_BOT_TOKEN!,
 *   lookbackDays: 90,
 * });
 *
 * // One-call: fetch + analyze
 * const insights = await connector.run();
 *
 * console.log(insights.anomalies);
 * console.log(insights.causalRelationships);
 * console.log(insights.summary);
 * ```
 *
 * @packageDocumentation
 */

import { SlackClient } from './client/slack-client';
import { fetchChannels } from './fetcher/channel-fetcher';
import { fetchMessages } from './fetcher/message-fetcher';
import { fetchUsers } from './fetcher/user-fetcher';
import { transformToSignals } from './transform/signal-transformer';
import { embedMessages, searchMessages } from './transform/message-embedder';
import { analyzeWorkspace } from './analyzer/slack-analyzer';
import type {
  SlackConnectorConfig,
  SlackWorkspaceData,
  SlackInsights,
} from './types';
import type { MessageSearchResult } from './transform/message-embedder';

/**
 * Create a Slack connector instance
 */
export function createSlackConnector(config: SlackConnectorConfig) {
  const client = new SlackClient(config);
  const lookbackDays = config.lookbackDays ?? 90;
  const includeThreads = config.includeThreads ?? true;

  // Cache embeddings across searches
  let cachedEmbeddings: Map<string, number[]> | null = null;
  let cachedData: SlackWorkspaceData | null = null;

  return {
    /**
     * Fetch all workspace data from Slack
     */
    async fetch(): Promise<SlackWorkspaceData> {
      const channels = await fetchChannels(client, config);
      const { messages, threads } = await fetchMessages(
        client,
        channels,
        lookbackDays,
        includeThreads
      );
      const users = await fetchUsers(client, config);

      const data: SlackWorkspaceData = {
        channels,
        messages,
        users,
        threads,
        metadata: {
          fetchedAt: new Date(),
          lookbackDays,
          channelCount: channels.length,
          messageCount: messages.length,
          userCount: users.length,
          threadCount: threads.size,
        },
      };

      cachedData = data;
      cachedEmbeddings = null; // Invalidate embedding cache
      return data;
    },

    /**
     * Transform fetched data into CrossDomainSignal array
     * compatible with @nexus-ai/memory-stack
     */
    transformToSignals(data: SlackWorkspaceData) {
      return transformToSignals(data, lookbackDays);
    },

    /**
     * Run full analysis on fetched data
     */
    analyze(data: SlackWorkspaceData): SlackInsights {
      return analyzeWorkspace(data);
    },

    /**
     * Semantic search across messages
     */
    searchMessages(
      query: string,
      data: SlackWorkspaceData,
      topK: number = 10
    ): MessageSearchResult[] {
      // Lazily generate embeddings
      if (!cachedEmbeddings || cachedData !== data) {
        cachedEmbeddings = embedMessages(data.messages);
        cachedData = data;
      }
      return searchMessages(query, data.messages, cachedEmbeddings, topK);
    },

    /**
     * One-call: fetch all data and return full insights
     */
    async run(): Promise<SlackInsights> {
      const data = await this.fetch();
      return this.analyze(data);
    },
  };
}

// Re-export types
export * from './types';

// Re-export sub-modules
export { SlackClient } from './client/slack-client';
export { fetchChannels } from './fetcher/channel-fetcher';
export { fetchMessages } from './fetcher/message-fetcher';
export { fetchUsers } from './fetcher/user-fetcher';
export { aggregateReactions } from './fetcher/reaction-fetcher';
export { transformToSignals } from './transform/signal-transformer';
export { extractChannelMetrics, extractUserMetrics, computeDailyMetrics } from './transform/metric-extractor';
export { embedMessages, searchMessages } from './transform/message-embedder';
export { analyzeSentiment, analyzeSentimentBatch } from './transform/sentiment-analyzer';
export { analyzeWorkspace } from './analyzer/slack-analyzer';
export { computeChannelMetrics } from './analyzer/channel-insights';
export { buildCommunicationGraph, computeSentimentTrends } from './analyzer/communication-patterns';
