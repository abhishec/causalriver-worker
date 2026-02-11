/**
 * User Fetcher
 *
 * Fetches Slack workspace users with optional anonymization.
 */

import type { SlackClient } from '../client/slack-client';
import type { SlackConnectorConfig, SlackUser } from '../types';

/**
 * Fetch users from the workspace, filtering bots and deleted users
 */
export async function fetchUsers(
  client: SlackClient,
  config: SlackConnectorConfig
): Promise<SlackUser[]> {
  const raw = await client.listUsers();

  let users: SlackUser[] = raw
    .filter((u: any) => !u.deleted && !u.is_bot && u.id !== 'USLACKBOT')
    .map((u: any) => ({
      id: u.id,
      name: u.name,
      real_name: u.real_name,
      profile: {
        email: u.profile?.email,
        title: u.profile?.title,
        team: u.profile?.team,
        display_name: u.profile?.display_name,
      },
      deleted: u.deleted ?? false,
      is_bot: u.is_bot ?? false,
    }));

  // Anonymize if requested
  if (config.anonymize) {
    users = users.map((u, idx) => ({
      ...u,
      name: `user_${idx}`,
      real_name: `User ${idx}`,
      profile: {
        ...u.profile,
        email: undefined,
        display_name: `User ${idx}`,
      },
    }));
  }

  return users;
}
