import { describe, it, expect } from 'vitest';
import { crossDomainToConnectorSignals, messagesToConnectorSignals } from '../transform/signal-bridge';
import { mockMessage } from './helpers/mock-slack-api';

describe('crossDomainToConnectorSignals', () => {
  it('converts CrossDomainSignal to ConnectorSignal with org ID', () => {
    const crossDomainSignals = [
      {
        signal_type: 'message_volume',
        source_domain: 'slack',
        entity_type: 'channel',
        entity_id: 'C001',
        signal_value: 0.5,
        feature_vector: { message_count: 100, unique_users: 10 },
        signal_metadata: { channel_name: 'general' },
        lookback_window_days: 90,
      },
    ];

    const result = crossDomainToConnectorSignals(crossDomainSignals, 'org_123');

    expect(result).toHaveLength(1);
    expect(result[0].organization_id).toBe('org_123');
    expect(result[0].source_domain).toBe('slack');
    expect(result[0].signal_type).toBe('message_volume');
    expect(result[0].signal_value).toBe(0.5);
    expect(result[0].entity_type).toBe('channel');
    expect(result[0].entity_id).toBe('C001');
    expect(result[0].metadata).toEqual({
      channel_name: 'general',
      feature_vector: { message_count: 100, unique_users: 10 },
      lookback_window_days: 90,
    });
  });

  it('handles empty array', () => {
    const result = crossDomainToConnectorSignals([], 'org_123');
    expect(result).toEqual([]);
  });

  it('preserves client_id if present', () => {
    const signals = [
      {
        signal_type: 'user_activity',
        source_domain: 'slack',
        entity_type: 'user',
        entity_id: 'U001',
        client_id: 'client_abc',
        signal_value: 0.8,
        feature_vector: { messages_sent: 50 },
        signal_metadata: {},
        lookback_window_days: 30,
      },
    ];

    const result = crossDomainToConnectorSignals(signals, 'org_456');
    expect(result[0].client_id).toBe('client_abc');
  });
});

describe('messagesToConnectorSignals', () => {
  it('converts messages to ConnectorSignal format', () => {
    const messages = [
      mockMessage({ ts: '1700000000.000', channel: 'C001', user: 'U001', text: 'Hello' }),
      mockMessage({ ts: '1700001000.000', channel: 'C001', user: 'U002', text: 'World', thread_ts: '1700000000.000' }),
    ];

    const result = messagesToConnectorSignals(messages, 'org_123', 'communication');

    expect(result).toHaveLength(2);

    // First message: regular message
    expect(result[0].organization_id).toBe('org_123');
    expect(result[0].source_domain).toBe('communication');
    expect(result[0].signal_type).toBe('message_sent');
    expect(result[0].signal_value).toBe(1);
    expect(result[0].entity_type).toBe('slack_message');
    expect(result[0].entity_id).toBe('C001_1700000000.000');

    // Second message: thread reply
    expect(result[1].signal_type).toBe('thread_reply');
  });

  it('truncates text to 500 chars in metadata', () => {
    const longText = 'A'.repeat(1000);
    const messages = [mockMessage({ text: longText })];

    const result = messagesToConnectorSignals(messages, 'org_123', 'communication');
    expect((result[0].metadata as any).text).toHaveLength(500);
  });

  it('handles empty message list', () => {
    const result = messagesToConnectorSignals([], 'org_123', 'communication');
    expect(result).toEqual([]);
  });
});
