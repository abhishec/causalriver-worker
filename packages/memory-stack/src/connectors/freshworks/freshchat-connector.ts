/**
 * Freshchat Connector
 * ===================
 * Ingests live-chat conversations, messages, and agent interactions from Freshchat.
 * Freshchat uses Bearer token (API key) authentication.
 *
 * Signal types emitted:
 *   - freshchat_conversation:  Chat conversation (open/resolved/waiting)
 *   - freshchat_message:       Individual chat message within a conversation
 *
 * These signals power the Support domain in NexusBrain SE-aaS, specifically:
 *   - Customer sentiment tracking
 *   - Support queue depth and response time analysis
 *   - Agent performance metrics
 */

import { ConnectorBase, IngestionResult } from '../base/connector-base.js';
import { RateLimitConfig } from '../base/rate-limiter.js';
import { Signal } from '../base/stream-processor.js';
import { Checkpoint } from '../base/checkpoint-manager.js';

interface FreshchatCredentials {
  apiKey: string;   // Bearer token from Freshchat API settings
  domain: string;   // e.g. "yourcompany.freshchat.com"
}

interface FreshchatConversation {
  conversation_id: string;
  status: 'new' | 'assigned' | 'resolved' | 'waiting-on-customer' | 'waiting-on-internally';
  channel_id: string;
  created_time: string;
  updated_time: string;
  assigned_agent_id: string | null;
  assigned_group_id: string | null;
  conversation_labels: string[];
  messages?: FreshchatMessage[];
}

interface FreshchatMessage {
  id: string;
  conversation_id: string;
  message_type: 'normal' | 'private' | 'automated';
  message_parts: Array<{
    text?: { content: string };
    image?: { url: string };
    file?: { name: string };
  }>;
  actor_type: 'agent' | 'user';
  actor_id: string;
  created_time: string;
}

export class FreshchatConnector extends ConnectorBase {
  readonly connectorType = 'freshchat';

  constructor(
    organizationId: string,
    private freshchatCreds: FreshchatCredentials,
    supabase: any,
    redis?: any
  ) {
    super(organizationId, freshchatCreds, supabase, redis);
  }

  protected getRateLimits(): RateLimitConfig {
    return {
      requestsPerSecond: 8, // Freshchat API: ~500 req/min
      backoffMultiplier: 2,
      maxRetries: 3,
      initialBackoffMs: 1000,
    };
  }

  // ─── Initial Load ──────────────────────────────────────────────────────────

  protected async initialLoad(): Promise<IngestionResult> {
    console.log('[Freshchat] Starting initial load...');
    let total = 0;

    try {
      // Fetch all conversations with messages
      const convCount = await this.ingestConversations();
      total += convCount;

      console.log(`[Freshchat] Initial load complete: ${total} signals`);
      return { success: true, signalsIngested: total };
    } catch (error: any) {
      console.error('[Freshchat] Initial load failed:', error);
      return { success: false, signalsIngested: total, errors: [error.message] };
    }
  }

  // ─── Incremental Sync ─────────────────────────────────────────────────────

  protected async incrementalSync(): Promise<IngestionResult> {
    console.log('[Freshchat] Starting incremental sync...');
    let total = 0;

    try {
      const checkpoint = await this.checkpointManager.getCheckpoint(
        this.organizationId,
        this.connectorType
      );
      const since = checkpoint?.updated_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const convCount = await this.ingestConversations(since);
      total += convCount;

      console.log(`[Freshchat] Incremental sync complete: ${total} signals`);
      return { success: true, signalsIngested: total };
    } catch (error: any) {
      console.error('[Freshchat] Incremental sync failed:', error);
      return { success: false, signalsIngested: total, errors: [error.message] };
    }
  }

  // ─── Resume ───────────────────────────────────────────────────────────────

  protected async resumeIngestion(checkpoint: Checkpoint): Promise<IngestionResult> {
    console.log('[Freshchat] Resuming from checkpoint:', checkpoint.state);
    const since = checkpoint.state.lastConversationTime || undefined;
    const convCount = await this.ingestConversations(since);
    return { success: true, signalsIngested: convCount };
  }

  // ─── Conversations ────────────────────────────────────────────────────────

  private async ingestConversations(since?: string): Promise<number> {
    let page = 1;
    let total = 0;
    const PAGE_SIZE = 100;

    while (true) {
      // Freshchat v2 API: list conversations with optional filter
      const params = new URLSearchParams({
        page: String(page),
        items_per_page: String(PAGE_SIZE),
      });
      if (since) {
        // Freshchat filters: updated_from is epoch ms
        const epochMs = new Date(since).getTime();
        params.set('updated_from', String(epochMs));
      }

      const response = await this.rateLimiter.throttle(() =>
        this.freshchatFetch(`/v2/conversations?${params.toString()}`)
      );

      const conversations: FreshchatConversation[] = response.conversations || [];
      if (conversations.length === 0) break;

      for (const conv of conversations) {
        await this.ingestConversation(conv);
        total++;

        // Fetch messages for this conversation
        const msgCount = await this.ingestMessages(conv.conversation_id);
        total += msgCount;
      }

      // Checkpoint every 500 conversations
      if (total % 500 === 0 && conversations.length > 0) {
        const lastConv = conversations[conversations.length - 1];
        await this.saveCheckpoint({
          page,
          conversationsProcessed: total,
          lastConversationTime: lastConv.updated_time,
        });
      }

      page++;
      if (conversations.length < PAGE_SIZE) break;
    }

    return total;
  }

  private async ingestConversation(conv: FreshchatConversation): Promise<void> {
    // Resolve time: some conversations may only have created_time
    const eventTime = conv.updated_time || conv.created_time;

    const signal: Signal = {
      source_domain: 'support.freshchat',
      signal_type: 'freshchat_conversation',
      signal_value: 1,
      entity_type: 'conversation',
      entity_id: `freshchat#conv_${conv.conversation_id}`,
      signal_metadata: {
        source: 'freshchat',
        content: `Freshchat conversation [${conv.status}] — labels: ${(conv.conversation_labels || []).join(', ')}`,
        conversation_id: conv.conversation_id,
        status: conv.status,
        channel_id: conv.channel_id,
        assigned_agent_id: conv.assigned_agent_id,
        assigned_group_id: conv.assigned_group_id,
        labels: conv.conversation_labels || [],
      },
      organization_id: this.organizationId,
      created_at: eventTime,
      signal_timestamp: eventTime,
    };

    await this.streamProcessor.addSignal(signal);
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  private async ingestMessages(conversationId: string): Promise<number> {
    let total = 0;

    try {
      // Freshchat returns paginated messages per conversation
      let page = 1;
      const PAGE_SIZE = 50;

      while (true) {
        const response = await this.rateLimiter.throttle(() =>
          this.freshchatFetch(
            `/v2/conversations/${conversationId}/messages?page=${page}&items_per_page=${PAGE_SIZE}`
          )
        );

        const messages: FreshchatMessage[] = response.messages || [];
        if (messages.length === 0) break;

        for (const msg of messages) {
          // Extract text content from message_parts
          const textContent = (msg.message_parts || [])
            .map((part) => part.text?.content || '')
            .filter(Boolean)
            .join('\n');

          if (!textContent && msg.message_type !== 'normal') continue; // skip media-only messages

          const signal: Signal = {
            source_domain: 'support.freshchat',
            signal_type: 'freshchat_message',
            signal_value: 1,
            entity_type: 'message',
            entity_id: `freshchat#conv_${conversationId}_msg_${msg.id}`,
            signal_metadata: {
              source: 'freshchat',
              content: textContent,
              message_id: msg.id,
              conversation_id: msg.conversation_id,
              message_type: msg.message_type,
              actor_type: msg.actor_type,
              actor_id: msg.actor_id,
            },
            organization_id: this.organizationId,
            created_at: msg.created_time,
            signal_timestamp: msg.created_time,
          };

          await this.streamProcessor.addSignal(signal);
          total++;
        }

        page++;
        if (messages.length < PAGE_SIZE) break;
      }
    } catch (error) {
      // Non-fatal — some conversations might be inaccessible
      console.warn(`[Freshchat] Failed to fetch messages for conversation ${conversationId}`);
    }

    return total;
  }

  // ─── API Helper ───────────────────────────────────────────────────────────

  private async freshchatFetch(endpoint: string): Promise<any> {
    const url = `https://${this.freshchatCreds.domain}${endpoint}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.freshchatCreds.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Freshchat API error: ${response.status} ${response.statusText} — ${body}`);
    }

    return response.json();
  }

  protected transformToSignal(rawData: any): Signal {
    throw new Error('Use ingestConversation/ingestMessages');
  }
}
