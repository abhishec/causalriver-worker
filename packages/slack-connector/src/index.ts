/**
 * Nexus Slack Connector
 *
 * Brain-native Slack connector for Nexus Intelligence.
 * Implements the NexusConnector interface for SyncManager compatibility
 * AND provides rich analytics (Granger causality, anomaly detection,
 * pattern discovery, semantic search).
 *
 * @example
 * ```typescript
 * import { createNexusSlackConnector } from '@nexus-ai/slack-connector';
 *
 * const connector = createNexusSlackConnector({
 *   token: process.env.SLACK_BOT_TOKEN!,
 *   lookbackDays: 90,
 *   organizationId: 'org_123',
 * });
 *
 * // Brain-native: plug into SyncManager
 * syncManager.registerConnector(connector);
 * await syncManager.syncAll(supabase, 'org_123');
 *
 * // Standalone analytics: one-call insights
 * const insights = await connector.run();
 *
 * // Push: send messages back to Slack
 * await connector.sendMessage('#general', 'Hello from NexusBrain!');
 * ```
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NexusConnector,
  ConnectorSyncResult,
  ConnectorSignal,
} from '@nexus-ai/memory-stack';
import {
  storeConnectorSignals,
  recordSyncResult,
} from '@nexus-ai/memory-stack';

import { SlackClient } from './client/slack-client';
import { fetchChannels } from './fetcher/channel-fetcher';
import { fetchMessages } from './fetcher/message-fetcher';
import { fetchUsers } from './fetcher/user-fetcher';
import { transformToSignals } from './transform/signal-transformer';
import { crossDomainToConnectorSignals, messagesToConnectorSignals } from './transform/signal-bridge';
import { embedMessages, searchMessages } from './transform/message-embedder';
import { analyzeWorkspace } from './analyzer/slack-analyzer';
import { handleSlackWebhook } from './webhook/slack-webhook';
import type {
  SlackConnectorConfig,
  SlackWorkspaceData,
  SlackInsights,
  SlackPushMessage,
  SlackApiResult,
} from './types';
import type { MessageSearchResult } from './transform/message-embedder';

/**
 * Extended Slack connector that implements NexusConnector AND provides
 * rich analytics and push capabilities.
 */
export interface NexusSlackConnector extends NexusConnector {
  // ── Push methods ──
  sendMessage(channel: string, text: string, options?: Partial<SlackPushMessage>): Promise<SlackApiResult>;
  replyToThread(channel: string, threadTs: string, text: string): Promise<SlackApiResult>;
  addReaction(channel: string, timestamp: string, emoji: string): Promise<SlackApiResult>;
  uploadSnippet(channel: string, content: string, title?: string): Promise<SlackApiResult>;

  // ── Analytics API ──
  fetch(): Promise<SlackWorkspaceData>;
  transformToSignals(data: SlackWorkspaceData): ReturnType<typeof transformToSignals>;
  analyze(data: SlackWorkspaceData): SlackInsights;
  searchMessages(query: string, data: SlackWorkspaceData, topK?: number): MessageSearchResult[];
  run(): Promise<SlackInsights>;
}

/**
 * Create a Brain-native Slack connector.
 *
 * Satisfies the NexusConnector interface (fullSync, incrementalSync, handleWebhook)
 * so it can be registered with createSyncManager. Also provides standalone
 * analytics via fetch/analyze/run and push via sendMessage/replyToThread.
 */
export function createNexusSlackConnector(config: SlackConnectorConfig): NexusSlackConnector {
  const client = new SlackClient(config);
  const lookbackDays = config.lookbackDays ?? 90;
  const includeThreads = config.includeThreads ?? true;
  const domain = config.domain ?? 'communication';

  // Cache embeddings across searches
  let cachedEmbeddings: Map<string, number[]> | null = null;
  let cachedData: SlackWorkspaceData | null = null;

  /**
   * Internal: fetch workspace data with optional `since` for incremental sync
   */
  async function fetchWorkspaceData(since?: Date): Promise<SlackWorkspaceData> {
    const effectiveLookbackDays = since
      ? Math.ceil((Date.now() - since.getTime()) / 86_400_000)
      : lookbackDays;

    const channels = await fetchChannels(client, config);
    const { messages, threads } = await fetchMessages(
      client,
      channels,
      effectiveLookbackDays,
      includeThreads
    );
    const users = await fetchUsers(client, config);

    return {
      channels,
      messages,
      users,
      threads,
      metadata: {
        fetchedAt: new Date(),
        lookbackDays: effectiveLookbackDays,
        channelCount: channels.length,
        messageCount: messages.length,
        userCount: users.length,
        threadCount: threads.size,
      },
    };
  }

  /**
   * Internal: run sync (full or incremental), persist signals, record result
   */
  async function runSync(
    supabase: SupabaseClient,
    organizationId: string,
    since?: Date
  ): Promise<ConnectorSyncResult> {
    const start = Date.now();
    const errors: string[] = [];

    try {
      const data = await fetchWorkspaceData(since);

      // Generate both signal formats:
      // 1. Raw message signals for persistence (ConnectorSignal[])
      const messageSignals = messagesToConnectorSignals(data.messages, organizationId, domain);

      // 2. Analytics signals (CrossDomainSignal[] → ConnectorSignal[])
      const analyticsSignals = crossDomainToConnectorSignals(
        transformToSignals(data, data.metadata.lookbackDays),
        organizationId
      );

      const allSignals: ConnectorSignal[] = [...messageSignals, ...analyticsSignals];

      if (allSignals.length > 0) {
        await storeConnectorSignals(supabase, allSignals, undefined, organizationId);
      }

      const result: ConnectorSyncResult = {
        success: true,
        signalsGenerated: allSignals.length,
        recordsProcessed: data.messages.length,
        errors,
        duration_ms: Date.now() - start,
        lastSyncedAt: new Date(),
      };

      await recordSyncResult(supabase, 'slack', organizationId, result);
      return result;
    } catch (err) {
      return {
        success: false,
        signalsGenerated: 0,
        recordsProcessed: 0,
        errors: [err instanceof Error ? err.message : String(err)],
        duration_ms: Date.now() - start,
        lastSyncedAt: new Date(),
      };
    }
  }

  return {
    // ════════════════════════════════════════════════════════════════════
    // NexusConnector Interface
    // ════════════════════════════════════════════════════════════════════

    id: 'slack',
    name: 'Slack Intelligence',
    domain,

    async fullSync(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<ConnectorSyncResult> {
      return runSync(supabase, organizationId);
    },

    async incrementalSync(
      supabase: SupabaseClient,
      organizationId: string,
      since: Date
    ): Promise<ConnectorSyncResult> {
      return runSync(supabase, organizationId, since);
    },

    handleWebhook(payload: unknown): ConnectorSignal[] {
      return handleSlackWebhook(payload, config.organizationId ?? '', domain);
    },

    // ════════════════════════════════════════════════════════════════════
    // Push Methods
    // ════════════════════════════════════════════════════════════════════

    async sendMessage(
      channel: string,
      text: string,
      options?: Partial<SlackPushMessage>
    ): Promise<SlackApiResult> {
      return client.postMessage(channel, text, options?.threadTs);
    },

    async replyToThread(
      channel: string,
      threadTs: string,
      text: string
    ): Promise<SlackApiResult> {
      return client.postMessage(channel, text, threadTs);
    },

    async addReaction(
      channel: string,
      timestamp: string,
      emoji: string
    ): Promise<SlackApiResult> {
      return client.addReaction(channel, timestamp, emoji);
    },

    async uploadSnippet(
      channel: string,
      content: string,
      title?: string
    ): Promise<SlackApiResult> {
      return client.uploadSnippet(channel, content, title);
    },

    // ════════════════════════════════════════════════════════════════════
    // Analytics API (preserved from original)
    // ════════════════════════════════════════════════════════════════════

    async fetch(): Promise<SlackWorkspaceData> {
      const data = await fetchWorkspaceData();
      cachedData = data;
      cachedEmbeddings = null;
      return data;
    },

    transformToSignals(data: SlackWorkspaceData) {
      return transformToSignals(data, lookbackDays);
    },

    analyze(data: SlackWorkspaceData): SlackInsights {
      return analyzeWorkspace(data);
    },

    searchMessages(
      query: string,
      data: SlackWorkspaceData,
      topK: number = 10
    ): MessageSearchResult[] {
      if (!cachedEmbeddings || cachedData !== data) {
        cachedEmbeddings = embedMessages(data.messages);
        cachedData = data;
      }
      return searchMessages(query, data.messages, cachedEmbeddings, topK);
    },

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
export { crossDomainToConnectorSignals, messagesToConnectorSignals } from './transform/signal-bridge';
export { extractChannelMetrics, extractUserMetrics, computeDailyMetrics } from './transform/metric-extractor';
export { embedMessages, searchMessages } from './transform/message-embedder';
export { analyzeSentiment, analyzeSentimentBatch } from './transform/sentiment-analyzer';
export { analyzeWorkspace } from './analyzer/slack-analyzer';
export { computeChannelMetrics } from './analyzer/channel-insights';
export { buildCommunicationGraph, computeSentimentTrends } from './analyzer/communication-patterns';
export { handleSlackWebhook } from './webhook/slack-webhook';
