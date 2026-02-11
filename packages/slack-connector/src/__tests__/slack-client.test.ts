import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackClient } from '../client/slack-client';

// Mock @slack/web-api
vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    conversations: {
      list: vi.fn().mockResolvedValue({
        ok: true,
        channels: [{ id: 'C001', name: 'general' }],
        response_metadata: { next_cursor: '' },
      }),
      history: vi.fn().mockResolvedValue({
        ok: true,
        messages: [{ ts: '1234.5678', text: 'Hello', type: 'message' }],
        response_metadata: { next_cursor: '' },
      }),
      replies: vi.fn().mockResolvedValue({
        ok: true,
        messages: [
          { ts: '1234.5678', text: 'Parent' },
          { ts: '1234.6789', text: 'Reply 1' },
        ],
      }),
    },
    users: {
      list: vi.fn().mockResolvedValue({
        ok: true,
        members: [{ id: 'U001', name: 'alice', deleted: false, is_bot: false }],
        response_metadata: { next_cursor: '' },
      }),
    },
  })),
}));

describe('SlackClient', () => {
  let client: SlackClient;

  beforeEach(() => {
    client = new SlackClient({ token: 'xoxb-test-token', requestDelayMs: 0 });
  });

  it('lists channels', async () => {
    const channels = await client.listChannels();
    expect(channels).toHaveLength(1);
    expect(channels[0].id).toBe('C001');
  });

  it('gets channel history', async () => {
    const messages = await client.getChannelHistory('C001');
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('Hello');
  });

  it('gets thread replies (excludes parent)', async () => {
    const replies = await client.getThreadReplies('C001', '1234.5678');
    expect(replies).toHaveLength(1);
    expect(replies[0].text).toBe('Reply 1');
  });

  it('lists users', async () => {
    const users = await client.listUsers();
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('alice');
  });
});
