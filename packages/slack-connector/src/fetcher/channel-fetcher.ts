/**
 * Channel Fetcher
 *
 * Fetches and filters Slack channels based on configuration.
 */

import type { SlackClient } from '../client/slack-client';
import type { SlackChannel, SlackConnectorConfig } from '../types';

/**
 * Match a channel name against glob-like patterns.
 * Supports * as wildcard.
 */
function matchesPatterns(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(name);
  });
}

/**
 * Fetch channels from Slack and apply filters from config
 */
export async function fetchChannels(
  client: SlackClient,
  config: SlackConnectorConfig
): Promise<SlackChannel[]> {
  const raw = await client.listChannels();

  let channels: SlackChannel[] = raw.map((ch: any) => ({
    id: ch.id,
    name: ch.name,
    is_private: ch.is_private ?? false,
    is_archived: ch.is_archived ?? false,
    num_members: ch.num_members,
    created: ch.created,
    creator: ch.creator,
    topic: ch.topic,
    purpose: ch.purpose,
  }));

  // Filter archived
  channels = channels.filter((ch) => !ch.is_archived);

  // Include filter
  if (config.channels?.include?.length) {
    channels = channels.filter((ch) =>
      matchesPatterns(ch.name, config.channels!.include!)
    );
  }

  // Exclude filter
  if (config.channels?.exclude?.length) {
    channels = channels.filter(
      (ch) => !matchesPatterns(ch.name, config.channels!.exclude!)
    );
  }

  // Min members filter
  if (config.minChannelMembers) {
    channels = channels.filter(
      (ch) => (ch.num_members ?? 0) >= config.minChannelMembers!
    );
  }

  return channels;
}
