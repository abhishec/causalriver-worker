/**
 * Slack API Client
 *
 * Wraps @slack/web-api with rate limiting, pagination, and retry logic.
 *
 * @packageDocumentation
 */

import { WebClient } from '@slack/web-api';
import type { SlackConnectorConfig } from '../types';

export class SlackClient {
  private client: WebClient;
  private delayMs: number;
  private lastRequestTime = 0;

  constructor(config: SlackConnectorConfig) {
    this.client = new WebClient(config.token);
    this.delayMs = config.requestDelayMs ?? 100;
  }

  /**
   * Throttle requests to respect Slack rate limits
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Execute an API call with rate limit handling and retry on 429
   */
  private async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.throttle();

    try {
      return await fn();
    } catch (error: any) {
      // Retry on rate limit (429)
      if (error?.code === 'slack_webapi_rate_limited' || error?.status === 429) {
        const retryAfter = (error.retryAfter ?? 5) * 1000;
        await new Promise((resolve) => setTimeout(resolve, retryAfter));
        return fn();
      }
      throw error;
    }
  }

  /**
   * Generic cursor-based pagination
   */
  async paginate<T>(
    apiCall: (cursor?: string) => Promise<any>,
    dataKey: string
  ): Promise<T[]> {
    const results: T[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.execute(() => apiCall(cursor));

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.error ?? 'unknown'}`);
      }

      const data = response[dataKey];
      if (Array.isArray(data)) {
        results.push(...data);
      }

      cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return results;
  }

  /**
   * List all channels in the workspace
   */
  async listChannels(): Promise<any[]> {
    return this.paginate(
      (cursor) =>
        this.client.conversations.list({
          exclude_archived: true,
          types: 'public_channel,private_channel',
          limit: 200,
          cursor,
        }),
      'channels'
    );
  }

  /**
   * Get message history for a channel
   */
  async getChannelHistory(
    channelId: string,
    oldest?: string,
    latest?: string
  ): Promise<any[]> {
    return this.paginate(
      (cursor) =>
        this.client.conversations.history({
          channel: channelId,
          oldest,
          latest,
          limit: 200,
          cursor,
        }),
      'messages'
    );
  }

  /**
   * Get thread replies for a message
   */
  async getThreadReplies(channelId: string, threadTs: string): Promise<any[]> {
    const response = await this.execute(() =>
      this.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit: 200,
      })
    );

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.error ?? 'unknown'}`);
    }

    // First message is the parent; replies are the rest
    return (response.messages as any[])?.slice(1) ?? [];
  }

  /**
   * List all users in the workspace
   */
  async listUsers(): Promise<any[]> {
    return this.paginate(
      (cursor) =>
        this.client.users.list({
          limit: 200,
          cursor,
        }),
      'members'
    );
  }
}
