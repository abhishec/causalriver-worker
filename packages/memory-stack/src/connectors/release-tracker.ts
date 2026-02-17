/**
 * Release Tracker
 * ===============
 * Track 2 — Full Release Tracking for SE-aaS
 *
 * Connects a release (e.g. '6.3.4' on branch 'release/6.3.4') to:
 *   - All commits in that branch since the base version (git compare)
 *   - All PRs merged into that branch
 *   - All Jira tickets with fixVersion matching the release name
 *   - Git tags (to detect when a version was officially cut)
 *
 * Provides four SE-aaS query operations:
 *   getTicketsForVersion(releaseId)          — Jira tickets in this release
 *   getCommitsDiff(releaseId)                — commits since base_version
 *   getTeamVelocityByDrop(releaseId)         — PR merge rate per drop window
 *   getReleaseReadiness(releaseId)           — % tickets resolved, CI pass rate, PR merge rate
 *
 * Design: zero coupling to ConnectorBase — this is a pure query/sync service,
 * not a streaming signal ingester. It reads from cross_domain_signals and
 * writes to release_entities + release_entity_links.
 *
 * @module connectors/release-tracker
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface ReleaseConfig {
  /** Organisation ID */
  organizationId: string;
  /** Human-readable release label, e.g. '6.3.4' or '5.11.5-enterprise' */
  releaseName: string;
  /** Release type */
  releaseType: 'major' | 'minor' | 'patch' | 'enterprise';
  /** The git branch carrying this release, e.g. 'release/6.3.4' */
  branchName: string;
  /** The version this release is built on top of, e.g. '6.3.3' */
  baseVersion?: string;
  /** Target release date */
  targetDate?: string;
  /** Enterprise drops (optional) */
  drops?: Array<{ dropNumber: number; dropDate: string }>;
  /** Logical team identifier */
  teamLabel?: string;
  /** Team member GitHub logins / names */
  teamMembers?: string[];
  /** GitHub repo slug, e.g. 'tookitaki/aml-engine' */
  githubRepo?: string;
  /** Jira project key, e.g. 'TM' */
  jiraProjectKey?: string;
  /** Jira fixVersion name that maps to this release, e.g. '5.11.5' */
  jiraFixVersion?: string;
  /** GitHub personal access token for API calls */
  githubToken?: string;
  /** Jira credentials for fixVersion queries */
  jiraCredentials?: { baseUrl: string; email: string; apiToken: string };
}

export interface ReleaseEntity {
  id: string;
  organization_id: string;
  release_name: string;
  release_type: string;
  base_version?: string;
  branch_name: string;
  target_date?: string;
  drop_number?: number;
  drop_date?: string;
  team_label?: string;
  team_members: string[];
  github_repo?: string;
  jira_project_key?: string;
  jira_fix_version?: string;
  status: 'planned' | 'in_progress' | 'released';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ReleaseEntityLink {
  organization_id: string;
  release_id: string;
  entity_type: 'commit' | 'pull_request' | 'jira_issue' | 'git_tag';
  entity_id: string;
  link_source: 'git_tag' | 'jira_fixversion' | 'branch_merge' | 'github_compare' | 'manual';
  confidence: number;
  metadata: Record<string, any>;
}

export interface CommitDiff {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface ReleaseReadiness {
  releaseId: string;
  releaseName: string;
  branchName: string;
  targetDate?: string;
  metrics: {
    totalJiraTickets: number;
    resolvedTickets: number;
    ticketResolutionPct: number;
    totalPRs: number;
    mergedPRs: number;
    prMergeRatePct: number;
    openPRs: number;
    totalCommits: number;
    teamMembers: string[];
    activeMembersLastWeek: string[];
  };
  readinessScore: number;     // 0–100
  readinessLabel: 'red' | 'amber' | 'green';
  summary: string;
}

export interface VelocityByDrop {
  releaseId: string;
  releaseName: string;
  drops: Array<{
    dropNumber: number;
    dropDate: string;
    mergedPRs: number;
    resolvedTickets: number;
    authorBreakdown: Record<string, number>;
  }>;
}

// ============================================================================
// RELEASE TRACKER CLASS
// ============================================================================

export class ReleaseTracker {
  constructor(
    private supabase: SupabaseClient,
    private config: ReleaseConfig,
  ) {}

  // ── Registration ───────────────────────────────────────────────────────────

  /**
   * Register (upsert) a release entity in the DB.
   * Call this once when onboarding a new release / new design partner.
   * Safe to call repeatedly — uses upsert on (organization_id, release_name, drop_number).
   */
  async registerRelease(dropNumber?: number, dropDate?: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('release_entities')
      .upsert(
        {
          organization_id: this.config.organizationId,
          release_name: this.config.releaseName,
          release_type: this.config.releaseType,
          base_version: this.config.baseVersion,
          branch_name: this.config.branchName,
          target_date: this.config.targetDate,
          drop_number: dropNumber ?? null,
          drop_date: dropDate ?? null,
          team_label: this.config.teamLabel,
          team_members: this.config.teamMembers ?? [],
          github_repo: this.config.githubRepo,
          jira_project_key: this.config.jiraProjectKey,
          jira_fix_version: this.config.jiraFixVersion,
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'organization_id,release_name,drop_number',
          ignoreDuplicates: false,
        }
      )
      .select('id')
      .single();

    if (error) throw new Error(`[ReleaseTracker] registerRelease failed: ${error.message}`);
    return data.id;
  }

  /**
   * Register all drops for an enterprise release at once.
   * e.g. register '5.11.5-enterprise' with Drop 1 (Feb 26) and Drop 2 (Mar 15).
   */
  async registerAllDrops(): Promise<string[]> {
    if (!this.config.drops || this.config.drops.length === 0) {
      const id = await this.registerRelease();
      return [id];
    }

    const ids: string[] = [];
    for (const drop of this.config.drops) {
      const id = await this.registerRelease(drop.dropNumber, drop.dropDate);
      ids.push(id);
    }
    return ids;
  }

  // ── Link Discovery ─────────────────────────────────────────────────────────

  /**
   * Pull all commits since base_version using GitHub compare API.
   * Links them to the release via release_entity_links.
   */
  async syncCommitsFromGitHub(releaseId: string): Promise<number> {
    if (!this.config.githubToken || !this.config.githubRepo || !this.config.baseVersion) {
      console.warn('[ReleaseTracker] syncCommitsFromGitHub: missing githubToken, githubRepo, or baseVersion');
      return 0;
    }

    const base = encodeURIComponent(this.config.baseVersion);
    const head = encodeURIComponent(this.config.branchName);

    const response = await fetch(
      `https://api.github.com/repos/${this.config.githubRepo}/compare/${base}...${head}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'NexusBrain-ReleaseTracker',
        },
      }
    );

    if (!response.ok) {
      console.error(`[ReleaseTracker] GitHub compare failed: ${response.status} ${response.statusText}`);
      return 0;
    }

    const data = await response.json() as { commits: any[]; ahead_by: number; behind_by: number };
    const commits: CommitDiff[] = (data.commits ?? []).map((c: any) => ({
      sha: c.sha,
      message: c.commit?.message ?? '',
      author: c.commit?.author?.name ?? c.author?.login ?? 'unknown',
      date: c.commit?.author?.date ?? new Date().toISOString(),
      url: c.html_url ?? '',
    }));

    if (commits.length === 0) return 0;

    // Save links
    const links: ReleaseEntityLink[] = commits.map((commit) => ({
      organization_id: this.config.organizationId,
      release_id: releaseId,
      entity_type: 'commit',
      entity_id: `${this.config.githubRepo?.split('/')[1] ?? 'repo'}:${commit.sha}`,
      link_source: 'github_compare',
      confidence: 1.0,
      metadata: {
        sha: commit.sha,
        message: commit.message,
        author: commit.author,
        date: commit.date,
        url: commit.url,
      },
    }));

    await this.saveLinks(links);
    return links.length;
  }

  /**
   * Pull all Jira tickets with fixVersion = jiraFixVersion.
   * Links them to the release via release_entity_links.
   */
  async syncJiraTickets(releaseId: string): Promise<number> {
    if (!this.config.jiraCredentials || !this.config.jiraFixVersion) {
      console.warn('[ReleaseTracker] syncJiraTickets: missing jiraCredentials or jiraFixVersion');
      return 0;
    }

    const { baseUrl, email, apiToken } = this.config.jiraCredentials;
    const auth = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
    const projectFilter = this.config.jiraProjectKey
      ? ` AND project = "${this.config.jiraProjectKey}"`
      : '';
    const jql = `fixVersion = "${this.config.jiraFixVersion}"${projectFilter} ORDER BY created DESC`;

    const response = await fetch(
      `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=500&fields=summary,status,issuetype,assignee`,
      { headers: { Authorization: auth, Accept: 'application/json' } }
    );

    if (!response.ok) {
      console.error(`[ReleaseTracker] Jira fixVersion query failed: ${response.status}`);
      return 0;
    }

    const data = await response.json() as { issues: any[] };
    const issues = data.issues ?? [];

    if (issues.length === 0) return 0;

    const links: ReleaseEntityLink[] = issues.map((issue: any) => ({
      organization_id: this.config.organizationId,
      release_id: releaseId,
      entity_type: 'jira_issue',
      entity_id: `jira_${issue.key}`,
      link_source: 'jira_fixversion',
      confidence: 1.0,
      metadata: {
        key: issue.key,
        summary: issue.fields?.summary ?? '',
        status: issue.fields?.status?.name ?? '',
        issue_type: issue.fields?.issuetype?.name ?? '',
        assignee: issue.fields?.assignee?.displayName ?? null,
      },
    }));

    await this.saveLinks(links);
    return links.length;
  }

  /**
   * Pull PRs merged into the release branch from cross_domain_signals.
   * These are already ingested by the GitHub connector (Track 1).
   * This just creates release_entity_links rows for them.
   */
  async syncPRsFromSignals(releaseId: string): Promise<number> {
    const { data: prSignals } = await this.supabase
      .from('cross_domain_signals')
      .select('entity_id, signal_metadata, signal_timestamp')
      .eq('organization_id', this.config.organizationId)
      .eq('branch_name', this.config.branchName)
      .eq('entity_type', 'pull_request')
      .in('signal_type', ['pr_merged', 'pr_opened'])
      .order('signal_timestamp', { ascending: false })
      .limit(500);

    if (!prSignals || prSignals.length === 0) return 0;

    const links: ReleaseEntityLink[] = prSignals.map((sig: any) => ({
      organization_id: this.config.organizationId,
      release_id: releaseId,
      entity_type: 'pull_request',
      entity_id: sig.entity_id,
      link_source: 'branch_merge',
      confidence: 1.0,
      metadata: {
        pr_number: sig.signal_metadata?.pr_number,
        title: sig.signal_metadata?.title,
        author: sig.signal_metadata?.author,
        merged_at: sig.signal_metadata?.merged_at,
      },
    }));

    await this.saveLinks(links);
    return links.length;
  }

  /**
   * Run all three sync operations for a release.
   * Returns counts { commits, jiraTickets, prs }.
   */
  async syncAll(releaseId: string): Promise<{ commits: number; jiraTickets: number; prs: number }> {
    const [commits, jiraTickets, prs] = await Promise.all([
      this.syncCommitsFromGitHub(releaseId),
      this.syncJiraTickets(releaseId),
      this.syncPRsFromSignals(releaseId),
    ]);
    return { commits, jiraTickets, prs };
  }

  // ── SE-aaS Query Operations ────────────────────────────────────────────────

  /**
   * SE-aaS Query 1: getTicketsForVersion
   * "Show me all Jira tickets in the 5.11.5 release"
   */
  async getTicketsForVersion(releaseId: string): Promise<Array<{
    key: string;
    summary: string;
    status: string;
    issue_type: string;
    assignee: string | null;
  }>> {
    const { data: links } = await this.supabase
      .from('release_entity_links')
      .select('entity_id, metadata')
      .eq('release_id', releaseId)
      .eq('entity_type', 'jira_issue');

    return (links ?? []).map((l: any) => ({
      key: l.metadata?.key ?? l.entity_id.replace('jira_', ''),
      summary: l.metadata?.summary ?? '',
      status: l.metadata?.status ?? '',
      issue_type: l.metadata?.issue_type ?? '',
      assignee: l.metadata?.assignee ?? null,
    }));
  }

  /**
   * SE-aaS Query 2: getCommitsDiff
   * "What changed between 5.11.4.3 and 5.11.5?"
   */
  async getCommitsDiff(releaseId: string): Promise<Array<CommitDiff>> {
    const { data: links } = await this.supabase
      .from('release_entity_links')
      .select('entity_id, metadata')
      .eq('release_id', releaseId)
      .eq('entity_type', 'commit')
      .eq('link_source', 'github_compare');

    return (links ?? []).map((l: any) => ({
      sha: l.metadata?.sha ?? l.entity_id.split(':')[1] ?? '',
      message: l.metadata?.message ?? '',
      author: l.metadata?.author ?? '',
      date: l.metadata?.date ?? '',
      url: l.metadata?.url ?? '',
    }));
  }

  /**
   * SE-aaS Query 3: getTeamVelocityByDrop
   * "How many PRs and tickets did Team B complete in Drop 1 vs Drop 2?"
   */
  async getTeamVelocityByDrop(): Promise<VelocityByDrop> {
    // Get the release entity to find drops
    const { data: releases } = await this.supabase
      .from('release_entities')
      .select('*')
      .eq('organization_id', this.config.organizationId)
      .eq('release_name', this.config.releaseName)
      .order('drop_number', { ascending: true });

    if (!releases || releases.length === 0) {
      return { releaseId: '', releaseName: this.config.releaseName, drops: [] };
    }

    const drops: VelocityByDrop['drops'] = [];

    for (const release of releases) {
      if (!release.drop_number || !release.drop_date) continue;

      // Find drop window: from previous drop date (or release start) to this drop date
      const prevDrop = releases.find((r: any) => r.drop_number === release.drop_number - 1);
      const windowStart = prevDrop?.drop_date
        ? new Date(prevDrop.drop_date)
        : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000); // 6 months back as fallback
      const windowEnd = new Date(release.drop_date);

      // Merged PRs in window on this branch
      const { data: mergedPRs } = await this.supabase
        .from('cross_domain_signals')
        .select('entity_id, signal_metadata, signal_timestamp')
        .eq('organization_id', this.config.organizationId)
        .eq('branch_name', this.config.branchName)
        .eq('signal_type', 'pr_merged')
        .gte('signal_timestamp', windowStart.toISOString())
        .lte('signal_timestamp', windowEnd.toISOString());

      const authorBreakdown: Record<string, number> = {};
      for (const pr of mergedPRs ?? []) {
        const author = pr.signal_metadata?.author ?? 'unknown';
        authorBreakdown[author] = (authorBreakdown[author] ?? 0) + 1;
      }

      // Resolved Jira tickets in window (using release_entity_links for this drop)
      const { data: resolvedLinks } = await this.supabase
        .from('release_entity_links')
        .select('entity_id, metadata')
        .eq('release_id', release.id)
        .eq('entity_type', 'jira_issue');

      const resolvedCount = (resolvedLinks ?? []).filter(
        (l: any) => l.metadata?.status?.toLowerCase() === 'done'
      ).length;

      drops.push({
        dropNumber: release.drop_number,
        dropDate: release.drop_date,
        mergedPRs: (mergedPRs ?? []).length,
        resolvedTickets: resolvedCount,
        authorBreakdown,
      });
    }

    return {
      releaseId: releases[0].id,
      releaseName: this.config.releaseName,
      drops,
    };
  }

  /**
   * SE-aaS Query 4: getReleaseReadiness
   * "Is 6.3.4 ready to ship on Apr 7?"
   * Returns a readiness score 0–100 and label (red/amber/green).
   */
  async getReleaseReadiness(releaseId: string): Promise<ReleaseReadiness> {
    // Get the release entity
    const { data: release } = await this.supabase
      .from('release_entities')
      .select('*')
      .eq('id', releaseId)
      .single();

    if (!release) throw new Error(`[ReleaseTracker] Release ${releaseId} not found`);

    // Count Jira tickets
    const { data: ticketLinks } = await this.supabase
      .from('release_entity_links')
      .select('entity_id, metadata')
      .eq('release_id', releaseId)
      .eq('entity_type', 'jira_issue');

    const totalJiraTickets = (ticketLinks ?? []).length;
    const resolvedTickets = (ticketLinks ?? []).filter(
      (l: any) => l.metadata?.status?.toLowerCase() === 'done'
    ).length;
    const ticketResolutionPct = totalJiraTickets > 0
      ? Math.round((resolvedTickets / totalJiraTickets) * 100)
      : 0;

    // Count PRs from cross_domain_signals
    const { data: allPRs } = await this.supabase
      .from('cross_domain_signals')
      .select('entity_id, signal_type, signal_metadata')
      .eq('organization_id', this.config.organizationId)
      .eq('branch_name', this.config.branchName)
      .eq('entity_type', 'pull_request');

    const totalPRs = (allPRs ?? []).length;
    const mergedPRs = (allPRs ?? []).filter((s: any) => s.signal_type === 'pr_merged').length;
    const openPRs = (allPRs ?? []).filter((s: any) => s.signal_type === 'pr_opened').length;
    const prMergeRatePct = totalPRs > 0 ? Math.round((mergedPRs / totalPRs) * 100) : 0;

    // Count commits
    const { data: commitLinks } = await this.supabase
      .from('release_entity_links')
      .select('entity_id')
      .eq('release_id', releaseId)
      .eq('entity_type', 'commit');

    const totalCommits = (commitLinks ?? []).length;

    // Active members in last 7 days
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentCommits } = await this.supabase
      .from('cross_domain_signals')
      .select('signal_metadata')
      .eq('organization_id', this.config.organizationId)
      .eq('branch_name', this.config.branchName)
      .eq('entity_type', 'commit')
      .gte('signal_timestamp', oneWeekAgo);

    const activeMembersLastWeek = [
      ...new Set(
        (recentCommits ?? []).map((s: any) => s.signal_metadata?.author).filter(Boolean)
      ),
    ] as string[];

    // Readiness score: weighted average
    // 50% ticket resolution + 30% PR merge rate + 20% active team
    const teamActivityScore = release.team_members?.length > 0
      ? Math.min(100, (activeMembersLastWeek.length / release.team_members.length) * 100)
      : 50;

    const readinessScore = Math.round(
      ticketResolutionPct * 0.50 +
      prMergeRatePct * 0.30 +
      teamActivityScore * 0.20
    );

    const readinessLabel =
      readinessScore >= 80 ? 'green' :
      readinessScore >= 50 ? 'amber' : 'red';

    const daysToTarget = release.target_date
      ? Math.round((new Date(release.target_date).getTime() - Date.now()) / 86_400_000)
      : null;

    const summary = [
      `Release ${release.release_name} (${release.branch_name}):`,
      `  Tickets: ${resolvedTickets}/${totalJiraTickets} resolved (${ticketResolutionPct}%)`,
      `  PRs: ${mergedPRs}/${totalPRs} merged (${prMergeRatePct}%), ${openPRs} still open`,
      `  Commits: ${totalCommits} since ${release.base_version ?? 'base'}`,
      `  Active last 7d: ${activeMembersLastWeek.join(', ') || 'none'}`,
      daysToTarget !== null ? `  Days to target: ${daysToTarget}` : '',
      `  Readiness: ${readinessScore}/100 (${readinessLabel.toUpperCase()})`,
    ].filter(Boolean).join('\n');

    return {
      releaseId,
      releaseName: release.release_name,
      branchName: release.branch_name,
      targetDate: release.target_date,
      metrics: {
        totalJiraTickets,
        resolvedTickets,
        ticketResolutionPct,
        totalPRs,
        mergedPRs,
        prMergeRatePct,
        openPRs,
        totalCommits,
        teamMembers: release.team_members ?? [],
        activeMembersLastWeek,
      },
      readinessScore,
      readinessLabel,
      summary,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async saveLinks(links: ReleaseEntityLink[]): Promise<void> {
    if (links.length === 0) return;

    const { error } = await this.supabase
      .from('release_entity_links')
      .upsert(links, {
        onConflict: 'organization_id,release_id,entity_type,entity_id',
        ignoreDuplicates: true,
      });

    if (error) {
      console.warn('[ReleaseTracker] saveLinks upsert failed:', error.message);
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a ReleaseTracker for a specific release config.
 *
 * @example
 * // Tookitaki Team A — 6.3.4
 * const tracker634 = createReleaseTracker(supabase, {
 *   organizationId: orgId,
 *   releaseName: '6.3.4',
 *   releaseType: 'patch',
 *   branchName: 'release/6.3.4',
 *   baseVersion: '6.3.3',
 *   targetDate: '2026-04-07',
 *   teamLabel: 'team-634',
 *   teamMembers: ['Bao', 'Ravi', 'Mayank', 'Nitish', 'Ganesh'],
 *   githubRepo: 'tookitaki/aml-engine',
 *   jiraProjectKey: 'TM',
 *   jiraFixVersion: '6.3.4',
 *   githubToken: process.env.GITHUB_TOKEN,
 *   jiraCredentials: { baseUrl: '...', email: '...', apiToken: '...' },
 * });
 *
 * // Tookitaki Team B — 5.11.5 enterprise (two drops)
 * const tracker5115 = createReleaseTracker(supabase, {
 *   organizationId: orgId,
 *   releaseName: '5.11.5-enterprise',
 *   releaseType: 'enterprise',
 *   branchName: 'release/5.11.5-enterprise',
 *   baseVersion: '5.11.4.3',
 *   drops: [
 *     { dropNumber: 1, dropDate: '2026-02-26' },
 *     { dropNumber: 2, dropDate: '2026-03-15' },
 *   ],
 *   teamLabel: 'team-5115',
 *   teamMembers: ['Sandeep', 'Doan', 'Siva', 'Anish', 'Nagaru'],
 *   githubRepo: 'tookitaki/aml-engine',
 *   jiraProjectKey: 'TM',
 *   jiraFixVersion: '5.11.5-enterprise',
 *   githubToken: process.env.GITHUB_TOKEN,
 *   jiraCredentials: { baseUrl: '...', email: '...', apiToken: '...' },
 * });
 */
export function createReleaseTracker(
  supabase: SupabaseClient,
  config: ReleaseConfig,
): ReleaseTracker {
  return new ReleaseTracker(supabase, config);
}

// ============================================================================
// SE-aaS QUERY HELPERS (stateless, for Brain Commander routing)
// ============================================================================

/**
 * Look up a release entity by branch name.
 * Used by SE-aaS query handlers to resolve "which release is this branch?"
 */
export async function getReleaseByBranch(
  supabase: SupabaseClient,
  organizationId: string,
  branchName: string,
): Promise<ReleaseEntity | null> {
  const { data } = await supabase
    .from('release_entities')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('branch_name', branchName)
    .order('drop_number', { ascending: true })
    .limit(1)
    .single();

  return data ?? null;
}

/**
 * Look up a release entity by release name.
 * e.g. '5.11.5-enterprise' → release entity row
 */
export async function getReleaseByName(
  supabase: SupabaseClient,
  organizationId: string,
  releaseName: string,
): Promise<ReleaseEntity | null> {
  const { data } = await supabase
    .from('release_entities')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('release_name', releaseName)
    .order('drop_number', { ascending: true })
    .limit(1)
    .single();

  return data ?? null;
}

/**
 * List all active releases for an organisation.
 * Used by SE-aaS dashboard and Brain Commander context.
 */
export async function listActiveReleases(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ReleaseEntity[]> {
  const { data } = await supabase
    .from('release_entities')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'in_progress')
    .order('target_date', { ascending: true });

  return data ?? [];
}
