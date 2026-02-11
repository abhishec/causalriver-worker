/**
 * Signal Bridge
 *
 * Converts between CrossDomainSignal[] (analytics format) and
 * ConnectorSignal[] (Brain persistence format).
 *
 * This bridge is the KEY integration point that makes the slack-connector
 * compatible with the NexusBrain connector framework and SyncManager.
 */

import type { ConnectorSignal, CrossDomainSignal } from '@nexus-ai/memory-stack';
import type { SlackMessage } from '../types';

/**
 * Convert CrossDomainSignal[] (from signal-transformer) to ConnectorSignal[]
 * (for storeConnectorSignals persistence).
 */
export function crossDomainToConnectorSignals(
  signals: CrossDomainSignal[],
  organizationId: string
): ConnectorSignal[] {
  return signals.map((s) => ({
    organization_id: organizationId,
    source_domain: s.source_domain,
    signal_type: s.signal_type,
    signal_value: s.signal_value,
    entity_type: s.entity_type,
    entity_id: s.entity_id,
    client_id: s.client_id,
    metadata: {
      ...s.signal_metadata,
      feature_vector: s.feature_vector,
      lookback_window_days: s.lookback_window_days,
    },
  }));
}

/**
 * Convert raw Slack messages to ConnectorSignal[] for direct persistence.
 * Matches the pattern used by the memory-stack template connector.
 */
export function messagesToConnectorSignals(
  messages: SlackMessage[],
  organizationId: string,
  domain: string
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];

  for (const msg of messages) {
    const isThreadReply = msg.thread_ts && msg.thread_ts !== msg.ts;

    signals.push({
      organization_id: organizationId,
      source_domain: domain,
      signal_type: isThreadReply ? 'thread_reply' : 'message_sent',
      signal_value: 1,
      signal_timestamp: new Date(parseFloat(msg.ts) * 1000),
      entity_type: 'slack_message',
      entity_id: `${msg.channel}_${msg.ts}`,
      metadata: {
        channel: msg.channel,
        user: msg.user,
        text: (msg.text || '').substring(0, 500),
        hasThread: !!msg.thread_ts,
        replyCount: msg.reply_count || 0,
      },
    });
  }

  return signals;
}
