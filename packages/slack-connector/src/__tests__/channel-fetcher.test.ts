import { describe, it, expect, vi } from 'vitest';
import { fetchChannels } from '../fetcher/channel-fetcher';
import type { SlackClient } from '../client/slack-client';

function createMockClient(channels: any[]): SlackClient {
  return {
    listChannels: vi.fn().mockResolvedValue(channels),
  } as any;
}

describe('fetchChannels', () => {
  const baseChannels = [
    { id: 'C001', name: 'general', is_private: false, is_archived: false, num_members: 50, created: 1000 },
    { id: 'C002', name: 'engineering', is_private: false, is_archived: false, num_members: 20, created: 1000 },
    { id: 'C003', name: 'engineering-alerts', is_private: false, is_archived: false, num_members: 15, created: 1000 },
    { id: 'C004', name: 'random', is_private: false, is_archived: false, num_members: 50, created: 1000 },
    { id: 'C005', name: 'archived-stuff', is_private: false, is_archived: true, num_members: 5, created: 1000 },
    { id: 'C006', name: 'small', is_private: false, is_archived: false, num_members: 2, created: 1000 },
  ];

  it('filters out archived channels', async () => {
    const client = createMockClient(baseChannels);
    const result = await fetchChannels(client, { token: 'test' });
    expect(result.find((ch) => ch.name === 'archived-stuff')).toBeUndefined();
  });

  it('applies include patterns', async () => {
    const client = createMockClient(baseChannels);
    const result = await fetchChannels(client, {
      token: 'test',
      channels: { include: ['engineering*'] },
    });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name)).toContain('engineering');
    expect(result.map((c) => c.name)).toContain('engineering-alerts');
  });

  it('applies exclude patterns', async () => {
    const client = createMockClient(baseChannels);
    const result = await fetchChannels(client, {
      token: 'test',
      channels: { exclude: ['random'] },
    });
    expect(result.find((ch) => ch.name === 'random')).toBeUndefined();
  });

  it('applies minChannelMembers filter', async () => {
    const client = createMockClient(baseChannels);
    const result = await fetchChannels(client, {
      token: 'test',
      minChannelMembers: 10,
    });
    expect(result.find((ch) => ch.name === 'small')).toBeUndefined();
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('combines include and exclude', async () => {
    const client = createMockClient(baseChannels);
    const result = await fetchChannels(client, {
      token: 'test',
      channels: {
        include: ['engineering*', 'general'],
        exclude: ['engineering-alerts'],
      },
    });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name)).toEqual(
      expect.arrayContaining(['general', 'engineering'])
    );
  });
});
