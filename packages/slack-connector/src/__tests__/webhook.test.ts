import { describe, it, expect } from 'vitest';
import { handleSlackWebhook } from '../webhook/slack-webhook';

describe('handleSlackWebhook', () => {
  it('handles message event', () => {
    const payload = {
      team_id: 'T001',
      event: {
        type: 'message',
        user: 'U001',
        text: 'Hello from Slack',
        channel: 'C001',
        ts: '1700000000.000',
      },
    };

    const signals = handleSlackWebhook(payload, 'org_123', 'communication');

    expect(signals).toHaveLength(1);
    expect(signals[0].organization_id).toBe('org_123');
    expect(signals[0].source_domain).toBe('communication');
    expect(signals[0].signal_type).toBe('message_sent');
    expect(signals[0].signal_value).toBe(1);
    expect(signals[0].entity_type).toBe('slack_message');
    expect(signals[0].entity_id).toBe('C001_1700000000.000');
    expect(signals[0].metadata).toEqual({
      channel: 'C001',
      user: 'U001',
      text: 'Hello from Slack',
    });
  });

  it('handles thread reply event', () => {
    const payload = {
      team_id: 'T001',
      event: {
        type: 'message',
        user: 'U002',
        text: 'Thread reply',
        channel: 'C001',
        ts: '1700001000.000',
        thread_ts: '1700000000.000',
      },
    };

    const signals = handleSlackWebhook(payload, 'org_123', 'communication');

    expect(signals).toHaveLength(1);
    expect(signals[0].signal_type).toBe('thread_reply');
  });

  it('handles reaction_added event', () => {
    const payload = {
      team_id: 'T001',
      event: {
        type: 'reaction_added',
        user: 'U001',
        reaction: 'thumbsup',
        item: { channel: 'C001', ts: '1700000000.000' },
      },
    };

    const signals = handleSlackWebhook(payload, 'org_123', 'communication');

    expect(signals).toHaveLength(1);
    expect(signals[0].signal_type).toBe('reaction_added');
    expect(signals[0].entity_type).toBe('slack_reaction');
    expect(signals[0].entity_id).toBe('C001_1700000000.000_thumbsup');
    expect(signals[0].metadata).toEqual({
      user: 'U001',
      reaction: 'thumbsup',
      channel: 'C001',
    });
  });

  it('handles app_mention event', () => {
    const payload = {
      team_id: 'T001',
      event: {
        type: 'app_mention',
        user: 'U001',
        text: '<@BOT> help',
        channel: 'C001',
        ts: '1700000000.000',
      },
    };

    const signals = handleSlackWebhook(payload, 'org_123', 'communication');

    expect(signals).toHaveLength(1);
    expect(signals[0].signal_type).toBe('mention_received');
    expect(signals[0].entity_type).toBe('slack_mention');
  });

  it('ignores message subtypes', () => {
    const payload = {
      event: {
        type: 'message',
        subtype: 'channel_join',
        user: 'U001',
        text: 'User joined',
        channel: 'C001',
        ts: '1700000000.000',
      },
    };

    const signals = handleSlackWebhook(payload, 'org_123', 'communication');
    expect(signals).toHaveLength(0);
  });

  it('returns empty for null payload', () => {
    expect(handleSlackWebhook(null, 'org_123', 'communication')).toEqual([]);
  });

  it('returns empty for missing event', () => {
    expect(handleSlackWebhook({}, 'org_123', 'communication')).toEqual([]);
  });

  it('returns empty for unknown event type', () => {
    const payload = { event: { type: 'unknown_event' } };
    expect(handleSlackWebhook(payload, 'org_123', 'communication')).toEqual([]);
  });

  it('uses provided organizationId over team_id', () => {
    const payload = {
      team_id: 'T001',
      event: {
        type: 'message',
        user: 'U001',
        text: 'test',
        channel: 'C001',
        ts: '1700000000.000',
      },
    };

    const signals = handleSlackWebhook(payload, 'my_org', 'communication');
    expect(signals[0].organization_id).toBe('my_org');
  });

  it('defaults domain to communication', () => {
    const payload = {
      event: {
        type: 'message',
        user: 'U001',
        text: 'test',
        channel: 'C001',
        ts: '1700000000.000',
      },
    };

    const signals = handleSlackWebhook(payload, 'org_123');
    expect(signals[0].source_domain).toBe('communication');
  });

  it('truncates text to 2000 chars', () => {
    const longText = 'A'.repeat(3000);
    const payload = {
      event: {
        type: 'message',
        user: 'U001',
        text: longText,
        channel: 'C001',
        ts: '1700000000.000',
      },
    };

    const signals = handleSlackWebhook(payload, 'org_123', 'communication');
    expect((signals[0].metadata as any).text).toHaveLength(2000);
  });
});
