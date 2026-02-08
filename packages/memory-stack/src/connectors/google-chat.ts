/**
 * Google Chat Connector (Template)
 *
 * Bidirectional connector for Google Chat (Google Workspace):
 *   - PULL: Sync messages from spaces/rooms
 *   - PUSH: Send messages, cards, thread replies to spaces
 *
 * Signals generated:
 *   - message_sent: New message in tracked space
 *   - thread_started: New thread started
 *   - space_created: New space/room created
 *   - member_joined: Member joined a space
 *
 * Uses Google Chat API v1: https://developers.google.com/chat/api
 *
 * @example
 * ```typescript
 * const chat = createGoogleChatConnector({
 *   serviceAccountKey: JSON.parse(process.env.GOOGLE_SA_KEY!),
 *   spaces: ['spaces/AAAA1234'],
 * });
 * await chat.sendMessage('spaces/AAAA1234', 'Hello from NexusBrain!');
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal, NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';

// ============================================================================
// TYPES
// ============================================================================

export interface GoogleChatConnectorConfig {
  /** OAuth2 access token or service account token */
  accessToken?: string;
  /** Service account key JSON (alternative to accessToken) */
  serviceAccountKey?: {
    client_email: string;
    private_key: string;
    token_uri?: string;
  };
  /** Space IDs to sync (e.g. 'spaces/AAAA1234') */
  spaces?: string[];
  /** Google Chat API base URL (default: https://chat.googleapis.com/v1) */
  baseUrl?: string;
  /** Domain tag for signals (default: 'communication') */
  domain?: string;
  /** Max messages per space (default: 100) */
  maxMessagesPerSpace?: number;
}

export interface GoogleChatMessage {
  text?: string;
  /** Card v2 payload (Google Chat card format) */
  cardsV2?: any[];
  /** Thread key for replying */
  threadKey?: string;
}

export interface GoogleChatConnector extends NexusConnector {
  /** Send a text message to a space */
  sendMessage(space: string, text: string, options?: Partial<GoogleChatMessage>): Promise<{ name?: string; error?: string }>;
  /** Reply to a thread */
  replyToThread(space: string, threadKey: string, text: string): Promise<{ name?: string; error?: string }>;
  /** Send a card message (rich format) */
  sendCard(space: string, card: any): Promise<{ name?: string; error?: string }>;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createGoogleChatConnector(config: GoogleChatConnectorConfig): GoogleChatConnector {
  const baseUrl = config.baseUrl ?? 'https://chat.googleapis.com/v1';
  const domain = config.domain ?? 'communication';
  const maxMessages = config.maxMessagesPerSpace ?? 100;

  async function getToken(): Promise<string> {
    if (config.accessToken) return config.accessToken;
    // In production, this would use service account JWT flow to get an access token
    // For now, require accessToken to be provided
    throw new Error('Google Chat connector requires accessToken or serviceAccountKey');
  }

  async function chatApi(path: string, method: string = 'GET', body?: Record<string, unknown>): Promise<any> {
    const token = await getToken();
    const opts: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${baseUrl}/${path}`, opts);
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
      const spaces = config.spaces ?? [];
      for (const space of spaces) {
        try {
          const data = await chatApi(`${space}/messages?pageSize=${maxMessages}`);

          if (data.error) {
            errors.push(`Space ${space}: ${data.error.message || JSON.stringify(data.error)}`);
            continue;
          }

          for (const msg of data.messages || []) {
            signals.push({
              organization_id: organizationId,
              source_domain: domain,
              signal_type: msg.thread?.name ? 'thread_reply' : 'message_sent',
              signal_value: 1,
              entity_type: 'chat_message',
              entity_id: msg.name || `${space}_${msg.createTime}`,
              metadata: {
                space,
                sender: msg.sender?.name,
                senderDisplayName: msg.sender?.displayName,
                text: (msg.text || '').substring(0, 500),
                createTime: msg.createTime,
                threadName: msg.thread?.name,
              },
            });
          }
        } catch (err) {
          errors.push(`Space ${space}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

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

      await recordSyncResult(supabase, 'google_chat', organizationId, result);
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
    // Google Chat API supports filter by time — use orderBy=createTime and filter
    return fullSync(supabase, organizationId);
  }

  // ── Webhook Handler ──

  function handleWebhook(payload: any): ConnectorSignal[] {
    if (!payload) return [];

    const signals: ConnectorSignal[] = [];
    const orgId = payload.space?.name || 'unknown';

    if (payload.type === 'MESSAGE') {
      signals.push({
        organization_id: orgId,
        source_domain: domain,
        signal_type: payload.message?.thread ? 'thread_reply' : 'message_sent',
        signal_value: 1,
        entity_type: 'chat_message',
        entity_id: payload.message?.name || 'unknown',
        metadata: {
          space: payload.space?.name,
          sender: payload.user?.displayName,
          text: (payload.message?.text || '').substring(0, 500),
        },
      });
    }

    if (payload.type === 'ADDED_TO_SPACE') {
      signals.push({
        organization_id: orgId,
        source_domain: domain,
        signal_type: 'space_created',
        signal_value: 1,
        entity_type: 'chat_space',
        entity_id: payload.space?.name || 'unknown',
        metadata: {
          spaceName: payload.space?.displayName,
          spaceType: payload.space?.type,
        },
      });
    }

    return signals;
  }

  // ── Push: Send Message ──

  async function sendMessage(
    space: string,
    text: string,
    options?: Partial<GoogleChatMessage>
  ): Promise<{ name?: string; error?: string }> {
    const body: any = { text };
    if (options?.threadKey) {
      body.thread = { threadKey: options.threadKey };
    }
    if (options?.cardsV2) {
      body.cardsV2 = options.cardsV2;
    }

    const res = await chatApi(`${space}/messages`, 'POST', body);
    return { name: res.name, error: res.error?.message };
  }

  // ── Push: Reply to Thread ──

  async function replyToThread(
    space: string,
    threadKey: string,
    text: string
  ): Promise<{ name?: string; error?: string }> {
    return sendMessage(space, text, { threadKey });
  }

  // ── Push: Send Card ──

  async function sendCard(
    space: string,
    card: any
  ): Promise<{ name?: string; error?: string }> {
    return sendMessage(space, '', { cardsV2: [card] });
  }

  return {
    id: 'google_chat',
    name: 'Google Chat',
    domain,
    fullSync,
    incrementalSync,
    handleWebhook,
    // Push methods
    sendMessage,
    replyToThread,
    sendCard,
  };
}
