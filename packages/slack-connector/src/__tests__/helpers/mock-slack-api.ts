/**
 * Mock Slack API helpers for testing
 */

import type { SlackChannel, SlackMessage, SlackUser, SlackWorkspaceData } from '../../types';

let tsCounter = 1000000;

export function mockChannel(overrides: Partial<SlackChannel> = {}): SlackChannel {
  const id = overrides.id ?? `C${String(tsCounter++).padStart(6, '0')}`;
  return {
    id,
    name: overrides.name ?? `channel-${id}`,
    is_private: false,
    is_archived: false,
    num_members: 10,
    created: Math.floor(Date.now() / 1000) - 86400 * 30,
    ...overrides,
  };
}

export function mockMessage(overrides: Partial<SlackMessage> = {}): SlackMessage {
  const ts = overrides.ts ?? `${Date.now() / 1000 + tsCounter++}`;
  return {
    ts,
    user: overrides.user ?? 'U001',
    text: overrides.text ?? 'Hello world',
    channel: overrides.channel ?? 'C001',
    type: 'message',
    ...overrides,
  };
}

export function mockUser(overrides: Partial<SlackUser> = {}): SlackUser {
  const id = overrides.id ?? `U${String(tsCounter++).padStart(6, '0')}`;
  return {
    id,
    name: overrides.name ?? `user-${id}`,
    real_name: overrides.real_name ?? `User ${id}`,
    profile: {
      email: `${id}@example.com`,
      display_name: `User ${id}`,
      ...overrides.profile,
    },
    deleted: false,
    is_bot: false,
    ...overrides,
  };
}

/**
 * Create a complete mock workspace dataset for testing
 */
export function mockWorkspaceData(options: {
  channelCount?: number;
  messagesPerChannel?: number;
  userCount?: number;
  withThreads?: boolean;
  withReactions?: boolean;
} = {}): SlackWorkspaceData {
  const {
    channelCount = 3,
    messagesPerChannel = 20,
    userCount = 5,
    withThreads = true,
    withReactions = true,
  } = options;

  const users = Array.from({ length: userCount }, (_, i) =>
    mockUser({ id: `U${String(i + 1).padStart(3, '0')}`, name: `user${i + 1}` })
  );

  const channels = Array.from({ length: channelCount }, (_, i) =>
    mockChannel({ id: `C${String(i + 1).padStart(3, '0')}`, name: `channel-${i + 1}` })
  );

  const messages: SlackMessage[] = [];
  const threads = new Map<string, SlackMessage[]>();
  const baseTs = Date.now() / 1000 - 86400 * 30; // Start 30 days ago

  for (const channel of channels) {
    for (let j = 0; j < messagesPerChannel; j++) {
      const userId = users[j % users.length].id;
      const ts = String(baseTs + j * 3600 + Math.random() * 100);
      const isThread = withThreads && j % 5 === 0;

      const msg = mockMessage({
        ts,
        user: userId,
        channel: channel.id,
        text: getVariedText(j),
        reply_count: isThread ? 3 : undefined,
        reply_users_count: isThread ? 2 : undefined,
        reactions: withReactions && j % 3 === 0
          ? [
              { name: 'thumbsup', count: 2, users: [users[0].id, users[1].id] },
              { name: 'heart', count: 1, users: [users[2].id] },
            ]
          : undefined,
      });

      messages.push(msg);

      // Create thread replies
      if (isThread) {
        const replies = Array.from({ length: 3 }, (_, k) =>
          mockMessage({
            ts: String(parseFloat(ts) + (k + 1) * 300),
            user: users[(j + k + 1) % users.length].id,
            channel: channel.id,
            text: `Reply ${k + 1} to thread`,
            thread_ts: ts,
          })
        );
        threads.set(ts, replies);
      }
    }
  }

  return {
    channels,
    messages,
    users,
    threads,
    metadata: {
      fetchedAt: new Date(),
      lookbackDays: 90,
      channelCount: channels.length,
      messageCount: messages.length,
      userCount: users.length,
      threadCount: threads.size,
    },
  };
}

function getVariedText(index: number): string {
  const texts = [
    'Great work on the release!',
    'We have an issue with the deployment',
    'Can someone review this PR?',
    'Thanks for the quick fix!',
    'Bug found in production - urgent',
    'The new feature looks awesome',
    'Meeting at 3pm to discuss roadmap',
    'Shipped the update to staging',
    'Need help with the database migration',
    'Appreciate everyone helping with this',
    'There is a problem with the API',
    'Excellent progress this sprint',
    'Escalating this to engineering',
    'Performance looks fantastic after the fix',
    'Blocked on the backend changes',
  ];
  return texts[index % texts.length];
}
