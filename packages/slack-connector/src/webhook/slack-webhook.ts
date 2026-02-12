/**
 * Slack Webhook Handler
 *
 * Handles real-time Slack Events API payloads and converts them
 * to ConnectorSignal[] for the Brain event bus pipeline.
 *
 * Supports: message, reaction_added, app_mention events.
 */

import type { ConnectorSignal } from '@nexus-ai/memory-stack';

/**
 * Handle a Slack Events API webhook payload.
 *
 * @param payload - The raw webhook payload from Slack
 * @param organizationId - Organization ID for signal scoping
 * @param domain - Domain tag (default: 'communication')
 * @returns ConnectorSignal[] ready for storeConnectorSignals
 */
export function handleSlackWebhook(
  payload: unknown,
  organizationId: string,
  domain: string = 'communication'
): ConnectorSignal[] {
  if (!payload || typeof payload !== 'object') return [];

  const data = payload as Record<string, any>;
  const event = data.event;
  if (!event) return [];

  const signals: ConnectorSignal[] = [];
  const orgId = organizationId || data.team_id || 'unknown';

  switch (event.type) {
    case 'message':
      if (!event.subtype) {
        signals.push({
          organization_id: orgId,
          source_domain: domain,
          signal_type: event.thread_ts ? 'thread_reply' : 'message_sent',
          signal_value: 1,
          signal_timestamp: event.ts
            ? new Date(parseFloat(event.ts) * 1000)
            : undefined,
          entity_type: 'slack_message',
          entity_id: `${event.channel}_${event.ts}`,
          metadata: {
            channel: event.channel,
            user: event.user,
            text: (event.text || '').substring(0, 2000),
            threadTs: event.thread_ts || undefined,
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
        signal_timestamp: event.ts
          ? new Date(parseFloat(event.ts) * 1000)
          : undefined,
        entity_type: 'slack_mention',
        entity_id: `${event.channel}_${event.ts}`,
        metadata: {
          channel: event.channel,
          user: event.user,
          text: (event.text || '').substring(0, 2000),
        },
      });
      break;
  }

  return signals;
}
