/**
 * Slack Connector
 * ===============
 * Ingests channels, messages, threads, and reactions.
 * Optimized for 10M+ messages with channel-by-channel pagination.
 */

import { ConnectorBase, IngestionResult } from '../base/connector-base.js';
import { RateLimitConfig } from '../base/rate-limiter.js';
import { Signal } from '../base/stream-processor.js';
import { Checkpoint } from '../base/checkpoint-manager.js';

interface SlackCredentials {
  accessToken: string;
  teamId?: string;
  teamName?: string;
}

interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
  is_private: boolean;
  is_archived: boolean;
  topic: { value: string };
  purpose: { value: string };
  num_members: number;
}

interface SlackMessage {
  type: string;
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
  reactions?: Array<{ name: string; count: number; users: string[] }>;
  files?: any[];
  attachments?: any[];
}

export class SlackConnector extends ConnectorBase {
  readonly connectorType = 'slack';

  constructor(
    organizationId: string,
    private slackCreds: SlackCredentials,
    supabase: any,
    redis?: any
  ) {
    super(organizationId, slackCreds, supabase, redis);
  }

  protected getRateLimits(): RateLimitConfig {
    return {
      requestsPerMinute: 50, // Slack Tier 3 rate limit
      backoffMultiplier: 2,
      maxRetries: 5,
      initialBackoffMs: 1000,
    };
  }

  /**
   * Initial load: Fetch all channels → all messages
   */
  protected async initialLoad(): Promise<IngestionResult> {
    console.log('[Slack] Starting initial load...');
    let totalMessages = 0;

    try {
      // 1. Get all channels (public + private)
      const channels = await this.getAllChannels();
      console.log(`[Slack] Found ${channels.length} channels`);

      for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];

        // Skip archived channels
        if (channel.is_archived) continue;

        console.log(`[Slack] Processing #${channel.name} (${i + 1}/${channels.length})`);

        // 2. Fetch all messages in channel
        const messagesIngested = await this.ingestChannelMessages(channel);
        totalMessages += messagesIngested;

        // Save checkpoint after each channel
        const progress = ((i + 1) / channels.length) * 100;
        await this.saveCheckpoint(
          {
            lastChannel: channel.id,
            channelsProcessed: i + 1,
            totalChannels: channels.length,
          },
          Math.floor(progress)
        );
      }

      console.log(`[Slack] Initial load complete: ${totalMessages} messages`);
      return { success: true, signalsIngested: totalMessages };
    } catch (error: any) {
      console.error('[Slack] Initial load failed:', error);
      return { success: false, signalsIngested: totalMessages, errors: [error.message] };
    }
  }

  /**
   * Incremental sync: Only new messages since last sync
   */
  protected async incrementalSync(): Promise<IngestionResult> {
    console.log('[Slack] Starting incremental sync...');
    let totalMessages = 0;

    try {
      const checkpoint = await this.checkpointManager.getCheckpoint(
        this.organizationId,
        this.connectorType
      );

      const lastSyncTime = checkpoint?.updated_at
        ? new Date(checkpoint.updated_at).getTime() / 1000
        : (Date.now() - 24 * 60 * 60 * 1000) / 1000; // Default: 24 hours ago

      const channels = await this.getAllChannels();

      for (const channel of channels) {
        if (channel.is_archived) continue;

        // Fetch only messages since last sync
        const newMessages = await this.fetchMessagesSince(channel.id, lastSyncTime.toString());

        const signals = newMessages.map((msg) => this.transformMessageToSignal(channel, msg));
        await this.batchInsertSignals(signals);

        totalMessages += signals.length;
      }

      console.log(`[Slack] Incremental sync complete: ${totalMessages} new messages`);
      return { success: true, signalsIngested: totalMessages };
    } catch (error: any) {
      console.error('[Slack] Incremental sync failed:', error);
      return { success: false, signalsIngested: totalMessages, errors: [error.message] };
    }
  }

  /**
   * Resume from checkpoint
   */
  protected async resumeIngestion(checkpoint: Checkpoint): Promise<IngestionResult> {
    console.log('[Slack] Resuming from checkpoint:', checkpoint.state);

    const lastChannel = checkpoint.state.lastChannel;
    const channels = await this.getAllChannels();
    const resumeIndex = channels.findIndex((c) => c.id === lastChannel) + 1;

    console.log(`[Slack] Resuming from channel ${resumeIndex}/${channels.length}`);

    let totalMessages = checkpoint.signals_ingested || 0;

    for (let i = resumeIndex; i < channels.length; i++) {
      const channel = channels[i];
      if (channel.is_archived) continue;

      const messagesIngested = await this.ingestChannelMessages(channel);
      totalMessages += messagesIngested;

      const progress = ((i + 1) / channels.length) * 100;
      await this.saveCheckpoint(
        {
          lastChannel: channel.id,
          channelsProcessed: i + 1,
          totalChannels: channels.length,
        },
        Math.floor(progress)
      );
    }

    return { success: true, signalsIngested: totalMessages };
  }

  /**
   * Get all accessible channels
   */
  private async getAllChannels(): Promise<SlackChannel[]> {
    const allChannels: SlackChannel[] = [];

    // Public channels
    const publicChannels = await this.rateLimiter.throttle(() =>
      this.slackFetch('conversations.list', {
        exclude_archived: true,
        types: 'public_channel',
        limit: 1000,
      })
    );
    allChannels.push(...publicChannels.channels);

    // Private channels (groups)
    const privateChannels = await this.rateLimiter.throttle(() =>
      this.slackFetch('conversations.list', {
        exclude_archived: true,
        types: 'private_channel',
        limit: 1000,
      })
    );
    allChannels.push(...privateChannels.channels);

    return allChannels;
  }

  /**
   * Ingest all messages in a channel
   */
  private async ingestChannelMessages(channel: SlackChannel): Promise<number> {
    let messagesIngested = 0;
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      // Fetch 200 messages per page
      const response = await this.rateLimiter.throttle(() =>
        this.fetchMessages(channel.id, cursor)
      );

      if (!response.messages || response.messages.length === 0) {
        break;
      }

      // Transform to signals
      const signals = response.messages
        .filter((msg: SlackMessage) => msg.type === 'message')
        .map((msg: SlackMessage) => this.transformMessageToSignal(channel, msg));

      // Insert batch
      await this.batchInsertSignals(signals);
      messagesIngested += signals.length;

      // Check for more pages
      hasMore = response.has_more || false;
      cursor = response.response_metadata?.next_cursor;

      // Save checkpoint every 10K messages
      if (messagesIngested % 10000 === 0) {
        await this.saveCheckpoint({
          lastChannel: channel.id,
          lastMessageTs: response.messages[response.messages.length - 1]?.ts,
          messagesProcessed: messagesIngested,
        });
      }

      if (!cursor) break;
    }

    return messagesIngested;
  }

  /**
   * Fetch messages with pagination
   */
  private async fetchMessages(channelId: string, cursor?: string): Promise<any> {
    return this.slackFetch('conversations.history', {
      channel: channelId,
      limit: 200,
      cursor: cursor || undefined,
    });
  }

  /**
   * Fetch messages since timestamp
   */
  private async fetchMessagesSince(channelId: string, oldest: string): Promise<SlackMessage[]> {
    const response = await this.rateLimiter.throttle(() =>
      this.slackFetch('conversations.history', {
        channel: channelId,
        oldest,
        limit: 1000,
      })
    );

    return response.messages || [];
  }

  /**
   * Transform Slack message to signal
   */
  private transformMessageToSignal(channel: SlackChannel, message: SlackMessage): Signal {
    // Build content
    let content = message.text || '';

    // Add reactions
    if (message.reactions && message.reactions.length > 0) {
      const reactionSummary = message.reactions
        .map((r) => `${r.name} (${r.count})`)
        .join(', ');
      content += `\n\nReactions: ${reactionSummary}`;
    }

    // Add files
    if (message.files && message.files.length > 0) {
      const fileNames = message.files.map((f) => f.name || 'file').join(', ');
      content += `\n\nFiles: ${fileNames}`;
    }

    const eventTime = new Date(parseFloat(message.ts) * 1000).toISOString();
    return {
      source_domain: 'communication.slack',
      signal_type: message.thread_ts ? 'slack_thread_message' : 'slack_message',
      signal_value: 1,
      entity_type: message.thread_ts ? 'thread_message' : 'message',
      entity_id: `slack#${channel.id}_ts#${message.ts}`,
      signal_metadata: {
        source: 'slack',
        content: content.substring(0, 10000), // Limit to 10KB
        channel: channel.name,
        channel_id: channel.id,
        user: message.user,
        ts: message.ts,
        thread_ts: message.thread_ts,
        is_private: channel.is_private,
        reaction_count: message.reactions?.reduce((sum, r) => sum + r.count, 0) || 0,
      },
      organization_id: this.organizationId,
      created_at: eventTime,
      signal_timestamp: eventTime,
    };
  }

  /**
   * Slack API fetch helper
   */
  private async slackFetch(method: string, params: Record<string, any> = {}): Promise<any> {
    const url = new URL(`https://slack.com/api/${method}`);

    // Add params to URL
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.slackCreds.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data;
  }

  protected transformToSignal(rawData: any): Signal {
    throw new Error('Use transformMessageToSignal');
  }
}
