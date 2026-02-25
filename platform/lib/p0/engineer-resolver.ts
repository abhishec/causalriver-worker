/**
 * Engineer Entity Resolver
 * ========================
 *
 * Resolves GitHub usernames (from cross_domain_signals) to internal
 * NexusBrain engineer IDs and org_members.
 *
 * DATA FLOW:
 *   cross_domain_signals.signal_metadata.reviewer (github_login)
 *   → engineers.github_login → engineers.id
 *   → org_members (if user has linked their GitHub account)
 *
 * TABLES INVOLVED:
 *   - engineers: GitHub-specific identity (github_login, github_user_id)
 *   - org_members: Platform membership (user_id, role)
 *   - org_connectors: OAuth connection metadata (github_login → connected_by)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface ResolvedEngineer {
  /** Internal engineer table UUID */
  engineerId: string;
  /** GitHub login (username) */
  githubLogin: string;
  /** GitHub numeric user ID */
  githubUserId: string | null;
  /** Display name (from GitHub or manually set) */
  name: string;
  /** Linked NexusBrain user ID (from org_members via OAuth) */
  platformUserId: string | null;
  /** Org membership role (owner/admin/member/viewer) */
  orgRole: string | null;
  /** Email if available */
  email: string | null;
  /** Jira user ID if linked */
  jiraUserId: string | null;
}

export interface EngineerResolverCache {
  /** Resolve a single GitHub login to an engineer */
  resolve(githubLogin: string): Promise<ResolvedEngineer | null>;
  /** Resolve multiple GitHub logins in batch */
  resolveBatch(githubLogins: string[]): Promise<Map<string, ResolvedEngineer>>;
  /** Get the top reviewer's engineer ID (for bottleneck snapshot) */
  getEngineerId(githubLogin: string): Promise<string | null>;
  /** Clear the in-memory cache */
  clearCache(): void;
}

// ============================================================================
// RESOLVER
// ============================================================================

/**
 * Create an engineer resolver for a specific organization.
 *
 * Caches lookups in memory for the duration of a single analysis run.
 * Resolves GitHub logins → engineer IDs → org_members platform users.
 */
export function createEngineerResolver(
  supabase: SupabaseClient,
  organizationId: string
): EngineerResolverCache {
  const cache = new Map<string, ResolvedEngineer | null>();

  // Pre-loaded lookup tables (lazy initialized)
  let engineersLoaded = false;
  let engineersByGithubLogin = new Map<string, ResolvedEngineer>();

  async function loadEngineers(): Promise<void> {
    if (engineersLoaded) return;

    // Load all engineers for this org
    const { data: engineers } = await supabase
      .from('engineers')
      .select('id, github_login, github_user_id, name, email, jira_user_id')
      .eq('organization_id', organizationId);

    // Load org_connectors to find GitHub OAuth connections
    // These tell us which platform user connected GitHub (github_login → connected_by)
    const { data: connectors } = await supabase
      .from('org_connectors')
      .select('metadata')
      .eq('organization_id', organizationId)
      .eq('connector_type', 'github')
      .eq('status', 'active');

    // Build a map: github_login → platform user_id from OAuth connections
    const githubToPlatformUser = new Map<string, string>();
    for (const connector of connectors || []) {
      const meta = connector.metadata;
      if (meta?.github_login && meta?.connected_by) {
        githubToPlatformUser.set(meta.github_login, meta.connected_by);
      }
    }

    // Load org_members roles for resolved platform users
    const platformUserIds = Array.from(githubToPlatformUser.values());
    const roleMap = new Map<string, string>();
    if (platformUserIds.length > 0) {
      const { data: members } = await supabase
        .from('org_members')
        .select('user_id, role')
        .eq('organization_id', organizationId)
        .in('user_id', platformUserIds);

      for (const member of members || []) {
        roleMap.set(member.user_id, member.role);
      }
    }

    // Build resolved engineer map
    for (const eng of engineers || []) {
      const githubLogin = eng.github_login;
      if (!githubLogin) continue;

      const platformUserId = githubToPlatformUser.get(githubLogin) || null;

      engineersByGithubLogin.set(githubLogin, {
        engineerId: eng.id,
        githubLogin,
        githubUserId: eng.github_user_id || null,
        name: eng.name || githubLogin,
        platformUserId,
        orgRole: platformUserId ? (roleMap.get(platformUserId) || null) : null,
        email: eng.email || null,
        jiraUserId: eng.jira_user_id || null,
      });
    }

    engineersLoaded = true;
  }

  return {
    async resolve(githubLogin: string): Promise<ResolvedEngineer | null> {
      if (cache.has(githubLogin)) return cache.get(githubLogin)!;

      await loadEngineers();

      const resolved = engineersByGithubLogin.get(githubLogin) || null;
      cache.set(githubLogin, resolved);
      return resolved;
    },

    async resolveBatch(githubLogins: string[]): Promise<Map<string, ResolvedEngineer>> {
      await loadEngineers();

      const results = new Map<string, ResolvedEngineer>();
      for (const login of githubLogins) {
        const resolved = engineersByGithubLogin.get(login);
        if (resolved) {
          results.set(login, resolved);
          cache.set(login, resolved);
        }
      }
      return results;
    },

    async getEngineerId(githubLogin: string): Promise<string | null> {
      const resolved = await this.resolve(githubLogin);
      return resolved?.engineerId || null;
    },

    clearCache(): void {
      cache.clear();
      engineersLoaded = false;
      engineersByGithubLogin = new Map();
    },
  };
}

// ============================================================================
// CONVENIENCE: Wire into bottleneck analysis
// ============================================================================

/**
 * Resolve the top reviewer's engineer_id for bottleneck snapshot persistence.
 * Used by the early-warning analyze route.
 */
export async function resolveTopReviewerEngineerId(
  supabase: SupabaseClient,
  organizationId: string,
  topReviewerGithubLogin: string
): Promise<string | null> {
  if (!topReviewerGithubLogin || topReviewerGithubLogin === 'none' || topReviewerGithubLogin === 'unknown') {
    return null;
  }

  const { data } = await supabase
    .from('engineers')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('github_login', topReviewerGithubLogin)
    .maybeSingle();

  return data?.id || null;
}

/**
 * Enrich reviewer breakdown with engineer IDs and org roles.
 * Used to show real names and roles in the dashboard.
 */
export async function enrichReviewerBreakdown(
  supabase: SupabaseClient,
  organizationId: string,
  reviewerBreakdown: Array<{
    reviewer: string;
    reviewCount: number;
    share: number;
    avgLatencyHours: number;
    betweennessCentrality: number;
  }>
): Promise<Array<{
  reviewer: string;
  engineerId: string | null;
  displayName: string;
  orgRole: string | null;
  reviewCount: number;
  share: number;
  avgLatencyHours: number;
  betweennessCentrality: number;
}>> {
  const resolver = createEngineerResolver(supabase, organizationId);
  const logins = reviewerBreakdown.map((r) => r.reviewer);
  const resolved = await resolver.resolveBatch(logins);

  return reviewerBreakdown.map((r) => {
    const eng = resolved.get(r.reviewer);
    return {
      ...r,
      engineerId: eng?.engineerId || null,
      displayName: eng?.name || r.reviewer,
      orgRole: eng?.orgRole || null,
    };
  });
}
