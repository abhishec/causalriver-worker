/**
 * Slack Connector (Template)
 *
 * Bidirectional connector for Slack:
 *   - PULL: Sync messages, reactions, threads from channels
 *   - PUSH: Send messages, thread replies, reactions to channels
 *
 * Signals generated:
 *   - message_sent: New message in tracked channel
 *   - thread_started: New thread started
 *   - reaction_added: Emoji reaction on a message
 *   - mention_received: @mention of a user or bot
 *
 * @example
 * ```typescript
 * const slack = createSlackConnector({
 *   token: process.env.SLACK_BOT_TOKEN!,
 *   channels: ['C01234ABC', 'C05678DEF'],
 * });
 * // Pull
 * const result = await slack.fullSync(supabase, 'org_123');
 * // Push
 * await slack.sendMessage('C01234ABC', 'Hello from NexusBrain!');
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal, NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';
import { enrichSignalWithNLP } from '../core/nlp/signal-enricher';

// ============================================================================
// TYPES
// ============================================================================

export interface SlackConnectorConfig {
  /** Slack Bot OAuth token (xoxb-...) */
  token: string;
  /** Channel IDs to sync */
  channels?: string[];
  /** Slack API base URL (default: https://slack.com/api) */
  baseUrl?: string;
  /** Domain tag for signals (default: 'communication') */
  domain?: string;
  /** Max messages to sync per channel (default: 100) */
  maxMessagesPerChannel?: number;
}

export interface SlackMessage {
  channel: string;
  text: string;
  /** Thread timestamp to reply to */
  threadTs?: string;
  /** Parse mode: 'full' | 'none' (default: 'full') */
  parse?: string;
  /** Unfurl links (default: true) */
  unfurlLinks?: boolean;
  /** Metadata for the message */
  metadata?: Record<string, unknown>;
}

export interface SlackConnector extends NexusConnector {
  /** Send a message to a channel */
  sendMessage(channel: string, text: string, options?: Partial<SlackMessage>): Promise<{ ok: boolean; ts?: string; error?: string }>;
  /** Reply to a thread */
  replyToThread(channel: string, threadTs: string, text: string): Promise<{ ok: boolean; ts?: string; error?: string }>;
  /** Add a reaction to a message */
  addReaction(channel: string, timestamp: string, emoji: string): Promise<{ ok: boolean; error?: string }>;
  /** Upload a snippet or file */
  uploadSnippet(channel: string, content: string, title?: string): Promise<{ ok: boolean; error?: string }>;
}

// ============================================================================
// FACTORY
// ============================================================================

/** @deprecated Use `createNexusSlackConnector` from `@nexus-ai/slack-connector` instead. */
export function createSlackConnector(config: SlackConnectorConfig): SlackConnector {
  const baseUrl = config.baseUrl ?? 'https://slack.com/api';
  const domain = config.domain ?? 'communication';
  const maxMessages = config.maxMessagesPerChannel ?? 100;

  async function slackApi(method: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${baseUrl}/${method}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function slackGet(method: string, params: Record<string, string>): Promise<any> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${baseUrl}/${method}?${qs}`, {
      headers: { 'Authorization': `Bearer ${config.token}` },
    });
    return res.json();
  }

  // ── Pull: Full Sync ──

  async function fullSync(
    supabase: SupabaseClient,
    organizationId: string
  ): Promise<ConnectorSyncResult> {
    const start = Date.now();
    const signals: ConnectorSignal[] = [];
    const errors: string[] = [];

    try {
      const channels = config.channels ?? [];
      for (const channel of channels) {
        try {
          // Full cursor-based pagination — handles 1-10M messages per channel
          let cursor: string | undefined;
          let channelMsgCount = 0;

          while (true) {
            const params: Record<string, string> = {
              channel,
              limit: '200', // Slack max per page
            };
            if (cursor) {
              params.cursor = cursor;
            }

            const data = await slackGet('conversations.history', params);

            if (!data.ok) {
              errors.push(`Channel ${channel}: ${data.error}`);
              break;
            }

            for (const msg of data.messages || []) {
              const signal: ConnectorSignal = {
                organization_id: organizationId,
                source_domain: domain,
                signal_type: msg.thread_ts && msg.thread_ts !== msg.ts ? 'thread_reply' : 'message_sent',
                signal_value: 1,
                entity_type: 'slack_message',
                entity_id: `${channel}_${msg.ts}`,
                metadata: {
                  channel,
                  user: msg.user,
                  text: (msg.text || '').substring(0, 2000),
                  timestamp: msg.ts,
                  hasThread: !!msg.thread_ts,
                  replyCount: msg.reply_count || 0,
                },
              };

              // NLP enrichment: sentiment + topics + urgency from message text
              enrichSignalWithNLP(signal, ['text']);

              signals.push(signal);
              channelMsgCount++;
            }

            // Batch-store every 5000 signals to avoid OOM with millions of messages
            if (signals.length >= 5000) {
              await storeConnectorSignals(supabase, signals);
              signals.length = 0; // Clear after storing
            }

            // Cursor-based pagination: Slack returns next_cursor in response_metadata
            const nextCursor = data.response_metadata?.next_cursor;
            if (!nextCursor || nextCursor === '') break;
            cursor = nextCursor;

            // Rate limit: Slack allows ~1 req/sec for conversations.history (Tier 3)
            await new Promise(r => setTimeout(r, 100));
          }
        } catch (err) {
          errors.push(`Channel ${channel}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Store any remaining signals from the last batch
      if (signals.length > 0) {
        await storeConnectorSignals(supabase, signals);
      }

      const result: ConnectorSyncResult = {
        success: errors.length === 0,
        signalsGenerated: signals.length,
        recordsProcessed: signals.length,
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

  // ── Pull: Incremental Sync ──

  async function incrementalSync(
    supabase: SupabaseClient,
    organizationId: string,
    since: Date
  ): Promise<ConnectorSyncResult> {
    const start = Date.now();
    const signals: ConnectorSignal[] = [];
    const errors: string[] = [];
    const oldest = String(since.getTime() / 1000);

    try {
      const channels = config.channels ?? [];
      for (const channel of channels) {
        try {
          // Full cursor-based pagination for incremental sync
          let cursor: string | undefined;

          while (true) {
            const params: Record<string, string> = {
              channel,
              oldest,
              limit: '200', // Slack max per page
            };
            if (cursor) {
              params.cursor = cursor;
            }

            const data = await slackGet('conversations.history', params);

            if (!data.ok) {
              errors.push(`Channel ${channel}: ${data.error}`);
              break;
            }

            for (const msg of data.messages || []) {
              const signal: ConnectorSignal = {
                organization_id: organizationId,
                source_domain: domain,
                signal_type: msg.thread_ts && msg.thread_ts !== msg.ts ? 'thread_reply' : 'message_sent',
                signal_value: 1,
                entity_type: 'slack_message',
                entity_id: `${channel}_${msg.ts}`,
                metadata: {
                  channel,
                  user: msg.user,
                  text: (msg.text || '').substring(0, 2000),
                  timestamp: msg.ts,
                },
              };

              // NLP enrichment: sentiment + topics + urgency
              enrichSignalWithNLP(signal, ['text']);

              signals.push(signal);
            }

            // Batch-store every 5000 signals to avoid OOM
            if (signals.length >= 5000) {
              await storeConnectorSignals(supabase, signals);
              signals.length = 0;
            }

            // Cursor-based pagination
            const nextCursor = data.response_metadata?.next_cursor;
            if (!nextCursor || nextCursor === '') break;
            cursor = nextCursor;

            await new Promise(r => setTimeout(r, 100)); // Rate limit
          }
        } catch (err) {
          errors.push(`Channel ${channel}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (signals.length > 0) {
        await storeConnectorSignals(supabase, signals);
      }

      return {
        success: errors.length === 0,
        signalsGenerated: signals.length,
        recordsProcessed: signals.length,
        errors,
        duration_ms: Date.now() - start,
        lastSyncedAt: new Date(),
      };
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

  // ── Webhook Handler ──

  function handleWebhook(payload: any): ConnectorSignal[] {
    if (!payload || !payload.event) return [];

    const event = payload.event;
    const signals: ConnectorSignal[] = [];
    const orgId = payload.team_id || 'unknown';

    switch (event.type) {
      case 'message':
        if (!event.subtype) {
          signals.push({
            organization_id: orgId,
            source_domain: domain,
            signal_type: event.thread_ts ? 'thread_reply' : 'message_sent',
            signal_value: 1,
            entity_type: 'slack_message',
            entity_id: `${event.channel}_${event.ts}`,
            metadata: {
              channel: event.channel,
              user: event.user,
              text: (event.text || '').substring(0, 500),
            },
          });
        }
        break;

      case 'reaction_added':
        signals.push({
          organization_id: orgId,
          source_domain: domain,
          signal_type: 'reaction_added',
          signal_value: 1,
          entity_type: 'slack_reaction',
          entity_id: `${event.item?.channel}_${event.item?.ts}_${event.reaction}`,
          metadata: {
            user: event.user,
            reaction: event.reaction,
            channel: event.item?.channel,
          },
        });
        break;

      case 'app_mention':
        signals.push({
          organization_id: orgId,
          source_domain: domain,
          signal_type: 'mention_received',
          signal_value: 1,
          entity_type: 'slack_mention',
          entity_id: `${event.channel}_${event.ts}`,
          metadata: {
            channel: event.channel,
            user: event.user,
            text: (event.text || '').substring(0, 500),
          },
        });
        break;
    }

    return signals;
  }

  // ── Push: Send Message ──

  async function sendMessage(
    channel: string,
    text: string,
    options?: Partial<SlackMessage>
  ): Promise<{ ok: boolean; ts?: string; error?: string }> {
    const res = await slackApi('chat.postMessage', {
      channel,
      text,
      thread_ts: options?.threadTs,
      unfurl_links: options?.unfurlLinks ?? true,
    });
    return { ok: res.ok, ts: res.ts, error: res.error };
  }

  // ── Push: Reply to Thread ──

  async function replyToThread(
    channel: string,
    threadTs: string,
    text: string
  ): Promise<{ ok: boolean; ts?: string; error?: string }> {
    return sendMessage(channel, text, { threadTs });
  }

  // ── Push: Add Reaction ──

  async function addReaction(
    channel: string,
    timestamp: string,
    emoji: string
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await slackApi('reactions.add', {
      channel,
      timestamp,
      name: emoji,
    });
    return { ok: res.ok, error: res.error };
  }

  // ── Push: Upload Snippet ──

  async function uploadSnippet(
    channel: string,
    content: string,
    title?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await slackApi('files.upload', {
      channels: channel,
      content,
      title: title ?? 'Snippet from NexusBrain',
    });
    return { ok: res.ok, error: res.error };
  }

  return {
    id: 'slack',
    name: 'Slack',
    domain,
    fullSync,
    incrementalSync,
    handleWebhook,
    // Push methods
    sendMessage,
    replyToThread,
    addReaction,
    uploadSnippet,
  };
}
