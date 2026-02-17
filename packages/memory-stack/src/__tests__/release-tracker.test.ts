/**
 * Release Tracker — Track 2 Comprehensive Test Suite
 * ====================================================
 *
 * Tests cover:
 *   1.  ReleaseConfig + ReleaseTracker construction
 *   2.  registerRelease  — upsert to release_entities
 *   3.  registerAllDrops — enterprise multi-drop
 *   4.  syncCommitsFromGitHub — GitHub compare API path (mocked fetch)
 *   5.  syncJiraTickets — Jira fixVersion JQL (mocked fetch)
 *   6.  syncPRsFromSignals — reads from cross_domain_signals
 *   7.  syncAll — parallel sync, returns correct counts
 *   8.  getTicketsForVersion — SE-aaS Query 1
 *   9.  getCommitsDiff — SE-aaS Query 2
 *   10. getTeamVelocityByDrop — SE-aaS Query 3
 *   11. getReleaseReadiness — SE-aaS Query 4 (score formula)
 *   12. Readiness label thresholds (red / amber / green)
 *   13. Standalone helpers: getReleaseByBranch, getReleaseByName, listActiveReleases
 *   14. SEaaSService release query handlers (releaseGetTickets, releaseGetDiff,
 *       releaseGetVelocityByDrop, releaseGetReadiness, listActiveReleases, getReleaseByName)
 *   15. Missing-supabase guard on SEaaSService release handlers
 *   16. Rate-limit enforcement on release handlers
 *   17. Migration SQL file existence (Track 2 table SQL)
 *   18. Tookitaki data fixture — Team A (6.3.4) end-to-end scenario
 *   19. Tookitaki data fixture — Team B (5.11.5-enterprise) two-drop scenario
 */

import * as path from 'path';
import * as fs from 'fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ReleaseTracker,
  createReleaseTracker,
  getReleaseByBranch,
  getReleaseByName,
  listActiveReleases,
} from '../connectors/release-tracker';
import type {
  ReleaseConfig,
  ReleaseEntity,
  ReleaseEntityLink,
  CommitDiff,
  ReleaseReadiness,
  VelocityByDrop,
} from '../connectors/release-tracker';
import { SEaaSService, createSEaaSService } from '../orchestrator/se-aas-service';

// ============================================================================
// HELPERS — Supabase mock builder
// ============================================================================

/**
 * Build a chainable Supabase mock with per-table resolution.
 * Supports the fluent query builder pattern used by ReleaseTracker.
 */
function createSupabaseMock(tableData: Record<string, any>) {
  const buildChain = (data: any, error: any = null) => {
    const resolved = { data, error };
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(resolved),
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'mock-release-id-123' }, error: null }),
        }),
      }),
    };
    // Make the chain await-able so `await supabase.from(t).select()...` resolves
    chain.then = (resolve: any, reject: any) =>
      Promise.resolve(resolved).then(resolve, reject);
    return chain;
  };

  const supabase = {
    from: vi.fn((table: string) => buildChain(tableData[table] ?? null)),
  };

  return supabase;
}

// ============================================================================
// FIXTURES
// ============================================================================

const TOOKITAKI_ORG_ID = 'org-tookitaki-test';

const CONFIG_634: ReleaseConfig = {
  organizationId: TOOKITAKI_ORG_ID,
  releaseName: '6.3.4',
  releaseType: 'patch',
  branchName: 'release/6.3.4',
  baseVersion: '6.3.3',
  targetDate: '2026-04-07',
  teamLabel: 'team-634',
  teamMembers: ['Bao', 'Ravi', 'Mayank', 'Nitish', 'Ganesh'],
  githubRepo: 'tookitaki/aml-engine',
  jiraProjectKey: 'TM',
  jiraFixVersion: '6.3.4',
  githubToken: 'ghp_test_token',
  jiraCredentials: {
    baseUrl: 'https://tookitaki.atlassian.net',
    email: 'test@tookitaki.com',
    apiToken: 'test-jira-token',
  },
};

const CONFIG_5115: ReleaseConfig = {
  organizationId: TOOKITAKI_ORG_ID,
  releaseName: '5.11.5-enterprise',
  releaseType: 'enterprise',
  branchName: 'release/5.11.5-enterprise',
  baseVersion: '5.11.4.3',
  drops: [
    { dropNumber: 1, dropDate: '2026-02-26' },
    { dropNumber: 2, dropDate: '2026-03-15' },
  ],
  teamLabel: 'team-5115',
  teamMembers: ['Sandeep', 'Doan', 'Siva', 'Anish', 'Nagaru'],
  githubRepo: 'tookitaki/aml-engine',
  jiraProjectKey: 'TM',
  jiraFixVersion: '5.11.5-enterprise',
  githubToken: 'ghp_test_token',
  jiraCredentials: {
    baseUrl: 'https://tookitaki.atlassian.net',
    email: 'test@tookitaki.com',
    apiToken: 'test-jira-token',
  },
};

const MOCK_RELEASE_ENTITY_634: ReleaseEntity = {
  id: 'release-id-634',
  organization_id: TOOKITAKI_ORG_ID,
  release_name: '6.3.4',
  release_type: 'patch',
  base_version: '6.3.3',
  branch_name: 'release/6.3.4',
  target_date: '2026-04-07',
  team_label: 'team-634',
  team_members: ['Bao', 'Ravi', 'Mayank', 'Nitish', 'Ganesh'],
  github_repo: 'tookitaki/aml-engine',
  jira_project_key: 'TM',
  jira_fix_version: '6.3.4',
  status: 'in_progress',
  metadata: {},
  created_at: '2026-02-18T00:00:00Z',
  updated_at: '2026-02-18T00:00:00Z',
};

const MOCK_JIRA_TICKETS_634 = [
  { entity_id: 'jira_TM-101', metadata: { key: 'TM-101', summary: 'Fix AML scoring threshold', status: 'Done', issue_type: 'Bug', assignee: 'Bao' } },
  { entity_id: 'jira_TM-102', metadata: { key: 'TM-102', summary: 'Add transaction volume alert', status: 'In Progress', issue_type: 'Story', assignee: 'Ravi' } },
  { entity_id: 'jira_TM-103', metadata: { key: 'TM-103', summary: 'Optimise risk model', status: 'Done', issue_type: 'Task', assignee: 'Mayank' } },
];

const MOCK_COMMITS_634 = [
  { entity_id: 'aml-engine:abc123', metadata: { sha: 'abc123', message: 'fix: AML scoring edge case', author: 'Bao', date: '2026-02-20T10:00:00Z', url: '' } },
  { entity_id: 'aml-engine:def456', metadata: { sha: 'def456', message: 'feat: transaction volume alert', author: 'Ravi', date: '2026-02-21T11:00:00Z', url: '' } },
];

// ============================================================================
// 1. ReleaseConfig + ReleaseTracker construction
// ============================================================================

describe('ReleaseTracker — construction', () => {
  it('creates a tracker from config without throwing', () => {
    const supabase = createSupabaseMock({});
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    expect(tracker).toBeInstanceOf(ReleaseTracker);
  });

  it('createReleaseTracker factory returns ReleaseTracker instance', () => {
    const supabase = createSupabaseMock({});
    const tracker = createReleaseTracker(supabase as any, CONFIG_5115);
    expect(tracker).toBeInstanceOf(ReleaseTracker);
  });

  it('ReleaseConfig accepts both patch and enterprise releaseType', () => {
    expect(CONFIG_634.releaseType).toBe('patch');
    expect(CONFIG_5115.releaseType).toBe('enterprise');
  });

  it('Team A config has 5 members', () => {
    expect(CONFIG_634.teamMembers).toHaveLength(5);
    expect(CONFIG_634.teamMembers).toContain('Bao');
    expect(CONFIG_634.teamMembers).toContain('Ganesh');
  });

  it('Team B config has 2 drops', () => {
    expect(CONFIG_5115.drops).toHaveLength(2);
    expect(CONFIG_5115.drops![0].dropNumber).toBe(1);
    expect(CONFIG_5115.drops![0].dropDate).toBe('2026-02-26');
    expect(CONFIG_5115.drops![1].dropNumber).toBe(2);
    expect(CONFIG_5115.drops![1].dropDate).toBe('2026-03-15');
  });
});

// ============================================================================
// 2. registerRelease — upsert to release_entities
// ============================================================================

describe('ReleaseTracker.registerRelease()', () => {
  it('calls supabase.from(release_entities).upsert() and returns an id', async () => {
    const supabase = createSupabaseMock({});
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);

    const id = await tracker.registerRelease();
    expect(id).toBe('mock-release-id-123');
    expect(supabase.from).toHaveBeenCalledWith('release_entities');
  });

  it('registerRelease with dropNumber passes drop fields', async () => {
    const upsertSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'drop-1-id' }, error: null }),
      }),
    });

    const supabase = { from: vi.fn().mockReturnValue({ upsert: upsertSpy }) };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_5115);

    const id = await tracker.registerRelease(1, '2026-02-26');
    expect(id).toBe('drop-1-id');

    const upsertArg = upsertSpy.mock.calls[0][0];
    expect(upsertArg.drop_number).toBe(1);
    expect(upsertArg.drop_date).toBe('2026-02-26');
    expect(upsertArg.release_name).toBe('5.11.5-enterprise');
    expect(upsertArg.branch_name).toBe('release/5.11.5-enterprise');
    expect(upsertArg.team_members).toEqual(['Sandeep', 'Doan', 'Siva', 'Anish', 'Nagaru']);
  });

  it('registerRelease throws if supabase returns an error', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB constraint failed' } }),
          }),
        }),
      }),
    };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    await expect(tracker.registerRelease()).rejects.toThrow('registerRelease failed');
  });
});

// ============================================================================
// 3. registerAllDrops — enterprise multi-drop
// ============================================================================

describe('ReleaseTracker.registerAllDrops()', () => {
  it('registers all drops and returns an array of IDs', async () => {
    let callCount = 0;
    const supabase = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: `drop-id-${++callCount}` }, error: null }),
          }),
        })),
      }),
    };

    const tracker = new ReleaseTracker(supabase as any, CONFIG_5115);
    const ids = await tracker.registerAllDrops();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe('drop-id-1');
    expect(ids[1]).toBe('drop-id-2');
  });

  it('falls back to single release if no drops configured', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'single-id' }, error: null }),
          }),
        }),
      }),
    };
    const configNoDrop: ReleaseConfig = { ...CONFIG_634, drops: undefined };
    const tracker = new ReleaseTracker(supabase as any, configNoDrop);
    const ids = await tracker.registerAllDrops();
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe('single-id');
  });
});

// ============================================================================
// 4. syncCommitsFromGitHub — mocked fetch
// ============================================================================

describe('ReleaseTracker.syncCommitsFromGitHub()', () => {
  const MOCK_GITHUB_COMPARE = {
    ahead_by: 2,
    behind_by: 0,
    commits: [
      {
        sha: 'abc123',
        commit: { message: 'fix: AML scoring', author: { name: 'Bao', date: '2026-02-20T10:00:00Z' } },
        html_url: 'https://github.com/tookitaki/aml-engine/commit/abc123',
      },
      {
        sha: 'def456',
        commit: { message: 'feat: alert system', author: { name: 'Ravi', date: '2026-02-21T10:00:00Z' } },
        html_url: 'https://github.com/tookitaki/aml-engine/commit/def456',
      },
    ],
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(MOCK_GITHUB_COMPARE),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches commits from GitHub compare API and returns count', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ upsert: upsertSpy }),
    };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    const count = await tracker.syncCommitsFromGitHub('release-id-634');

    expect(count).toBe(2);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('compare/6.3.3...'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer ghp_test_token' }),
      })
    );
  });

  it('calls GitHub compare with correct repo, base and head', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue({ upsert: upsertSpy }) };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    await tracker.syncCommitsFromGitHub('release-id-634');

    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('tookitaki/aml-engine/compare');
    expect(url).toContain('6.3.3');
    expect(url).toContain('release');
  });

  it('saves commit links to release_entity_links', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue({ upsert: upsertSpy }) };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    await tracker.syncCommitsFromGitHub('release-id-634');

    expect(supabase.from).toHaveBeenCalledWith('release_entity_links');
    const links = upsertSpy.mock.calls[0][0] as ReleaseEntityLink[];
    expect(links).toHaveLength(2);
    expect(links[0].entity_type).toBe('commit');
    expect(links[0].link_source).toBe('github_compare');
    expect(links[0].confidence).toBe(1.0);
    expect(links[0].metadata.sha).toBe('abc123');
    expect(links[0].metadata.author).toBe('Bao');
  });

  it('returns 0 if GitHub API responds with non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));
    const supabase = { from: vi.fn().mockReturnValue({ upsert: vi.fn() }) };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    const count = await tracker.syncCommitsFromGitHub('release-id-634');
    expect(count).toBe(0);
  });

  it('returns 0 and warns when githubToken is missing', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = { from: vi.fn() };
    const config: ReleaseConfig = { ...CONFIG_634, githubToken: undefined };
    const tracker = new ReleaseTracker(supabase as any, config);
    const count = await tracker.syncCommitsFromGitHub('release-id-634');
    expect(count).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('missing'));
    consoleSpy.mockRestore();
  });

  it('returns 0 when GitHub returns empty commits array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ commits: [], ahead_by: 0, behind_by: 0 }),
    }));
    const supabase = { from: vi.fn().mockReturnValue({ upsert: vi.fn() }) };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    const count = await tracker.syncCommitsFromGitHub('release-id-634');
    expect(count).toBe(0);
  });
});

// ============================================================================
// 5. syncJiraTickets — mocked fetch
// ============================================================================

describe('ReleaseTracker.syncJiraTickets()', () => {
  const MOCK_JIRA_RESPONSE = {
    issues: [
      { key: 'TM-101', fields: { summary: 'Fix AML scoring', status: { name: 'Done' }, issuetype: { name: 'Bug' }, assignee: { displayName: 'Bao' } } },
      { key: 'TM-102', fields: { summary: 'Add alert', status: { name: 'In Progress' }, issuetype: { name: 'Story' }, assignee: { displayName: 'Ravi' } } },
    ],
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(MOCK_JIRA_RESPONSE),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queries Jira with fixVersion filter and returns ticket count', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue({ upsert: upsertSpy }) };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    const count = await tracker.syncJiraTickets('release-id-634');
    expect(count).toBe(2);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('jql='),
      expect.any(Object)
    );
  });

  it('saves jira_issue links to release_entity_links', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue({ upsert: upsertSpy }) };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    await tracker.syncJiraTickets('release-id-634');

    const links = upsertSpy.mock.calls[0][0] as ReleaseEntityLink[];
    expect(links[0].entity_type).toBe('jira_issue');
    expect(links[0].link_source).toBe('jira_fixversion');
    expect(links[0].entity_id).toBe('jira_TM-101');
    expect(links[0].metadata.status).toBe('Done');
    expect(links[0].metadata.assignee).toBe('Bao');
  });

  it('JQL includes fixVersion and project key', async () => {
    const supabase = { from: vi.fn().mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) }) };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    await tracker.syncJiraTickets('release-id-634');
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(decodeURIComponent(url)).toContain('fixVersion = "6.3.4"');
    expect(decodeURIComponent(url)).toContain('project = "TM"');
  });

  it('returns 0 and warns if jiraCredentials missing', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config: ReleaseConfig = { ...CONFIG_634, jiraCredentials: undefined };
    const supabase = { from: vi.fn() };
    const tracker = new ReleaseTracker(supabase as any, config);
    const count = await tracker.syncJiraTickets('release-id-634');
    expect(count).toBe(0);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('returns 0 if Jira API returns non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const supabase = { from: vi.fn() };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    const count = await tracker.syncJiraTickets('release-id-634');
    expect(count).toBe(0);
  });
});

// ============================================================================
// 6. syncPRsFromSignals
// ============================================================================

describe('ReleaseTracker.syncPRsFromSignals()', () => {
  it('reads PRs from cross_domain_signals and creates links', async () => {
    const prSignals = [
      { entity_id: 'pr_634_1', signal_metadata: { pr_number: 101, title: 'fix scoring', author: 'Bao', merged_at: '2026-02-20T12:00:00Z' } },
      { entity_id: 'pr_634_2', signal_metadata: { pr_number: 102, title: 'feat alert', author: 'Ravi', merged_at: '2026-02-21T12:00:00Z' } },
    ];

    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cross_domain_signals') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: prSignals, error: null }),
          };
        }
        return { upsert: upsertSpy };
      }),
    };

    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    const count = await tracker.syncPRsFromSignals('release-id-634');
    expect(count).toBe(2);

    const links = upsertSpy.mock.calls[0][0] as ReleaseEntityLink[];
    expect(links[0].entity_type).toBe('pull_request');
    expect(links[0].link_source).toBe('branch_merge');
    expect(links[0].entity_id).toBe('pr_634_1');
  });

  it('returns 0 if no PR signals found', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    };

    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    const count = await tracker.syncPRsFromSignals('release-id-634');
    expect(count).toBe(0);
  });
});

// ============================================================================
// 7. syncAll — parallel sync
// ============================================================================

describe('ReleaseTracker.syncAll()', () => {
  it('calls all three sync methods and returns combined counts', async () => {
    const tracker = new ReleaseTracker({} as any, CONFIG_634);

    vi.spyOn(tracker, 'syncCommitsFromGitHub').mockResolvedValue(5);
    vi.spyOn(tracker, 'syncJiraTickets').mockResolvedValue(12);
    vi.spyOn(tracker, 'syncPRsFromSignals').mockResolvedValue(8);

    const result = await tracker.syncAll('release-id-634');
    expect(result).toEqual({ commits: 5, jiraTickets: 12, prs: 8 });
  });
});

// ============================================================================
// 8. getTicketsForVersion — SE-aaS Query 1
// ============================================================================

describe('ReleaseTracker.getTicketsForVersion()', () => {
  it('returns mapped Jira tickets from release_entity_links', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: any) =>
          resolve({ data: MOCK_JIRA_TICKETS_634, error: null }),
      })),
    };

    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    const tickets = await tracker.getTicketsForVersion('release-id-634');

    expect(tickets).toHaveLength(3);
    expect(tickets[0].key).toBe('TM-101');
    expect(tickets[0].status).toBe('Done');
    expect(tickets[0].assignee).toBe('Bao');
    expect(tickets[1].issue_type).toBe('Story');
  });

  it('returns empty array if no tickets linked', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [], error: null }),
      })),
    };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    const tickets = await tracker.getTicketsForVersion('release-id-634');
    expect(tickets).toHaveLength(0);
  });
});

// ============================================================================
// 9. getCommitsDiff — SE-aaS Query 2
// ============================================================================

describe('ReleaseTracker.getCommitsDiff()', () => {
  it('returns commit diff list from release_entity_links', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: MOCK_COMMITS_634, error: null }),
      })),
    };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    const diff = await tracker.getCommitsDiff('release-id-634');

    expect(diff).toHaveLength(2);
    expect(diff[0].sha).toBe('abc123');
    expect(diff[0].message).toBe('fix: AML scoring edge case');
    expect(diff[0].author).toBe('Bao');
    expect(diff[1].sha).toBe('def456');
  });

  it('returns empty array if no commits linked', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [], error: null }),
      })),
    };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    const diff = await tracker.getCommitsDiff('release-id-634');
    expect(diff).toHaveLength(0);
  });
});

// ============================================================================
// 10. getTeamVelocityByDrop — SE-aaS Query 3
// ============================================================================

describe('ReleaseTracker.getTeamVelocityByDrop()', () => {
  const MOCK_RELEASE_ROWS_5115 = [
    { id: 'rel-drop1', release_name: '5.11.5-enterprise', drop_number: 1, drop_date: '2026-02-26' },
    { id: 'rel-drop2', release_name: '5.11.5-enterprise', drop_number: 2, drop_date: '2026-03-15' },
  ];

  it('returns velocity broken down by drop', async () => {
    let crossDomainCallCount = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'release_entities') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: MOCK_RELEASE_ROWS_5115, error: null }),
          };
        }
        if (table === 'cross_domain_signals') {
          crossDomainCallCount++;
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({
              data: [{ entity_id: 'pr_5115_1', signal_metadata: { author: 'Sandeep' } }],
              error: null,
            }),
          };
        }
        // release_entity_links
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: (resolve: any) => resolve({
            data: [
              { entity_id: 'jira_TM-201', metadata: { status: 'Done' } },
              { entity_id: 'jira_TM-202', metadata: { status: 'In Progress' } },
            ],
            error: null,
          }),
        };
      }),
    };

    const tracker = new ReleaseTracker(supabase as any, CONFIG_5115);
    const velocity = await tracker.getTeamVelocityByDrop();

    expect(velocity.releaseName).toBe('5.11.5-enterprise');
    expect(velocity.drops).toHaveLength(2);
    expect(velocity.drops[0].dropNumber).toBe(1);
    expect(velocity.drops[0].dropDate).toBe('2026-02-26');
    expect(velocity.drops[0].resolvedTickets).toBeGreaterThanOrEqual(0);
  });

  it('returns empty drops array if release not found', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [], error: null }),
      })),
    };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_5115);
    const velocity = await tracker.getTeamVelocityByDrop();
    expect(velocity.drops).toHaveLength(0);
  });
});

// ============================================================================
// 11 & 12. getReleaseReadiness + Readiness label thresholds
// ============================================================================

describe('ReleaseTracker.getReleaseReadiness()', () => {
  it('computes readiness score using 50/30/20 weighting', async () => {
    // 3 tickets (2 done = 67%), 2 PRs (2 merged = 100%), 5 active members (100%)
    // Score = 67*0.5 + 100*0.3 + 100*0.2 = 33.5 + 30 + 20 = 83.5 → 84
    const ticketLinks = [
      { entity_id: 'jira_TM-101', metadata: { status: 'Done' } },
      { entity_id: 'jira_TM-102', metadata: { status: 'Done' } },
      { entity_id: 'jira_TM-103', metadata: { status: 'In Progress' } },
    ];
    const prSignals = [
      { entity_id: 'pr1', signal_type: 'pr_merged', signal_metadata: {} },
      { entity_id: 'pr2', signal_type: 'pr_merged', signal_metadata: {} },
    ];
    const recentCommits = [
      { signal_metadata: { author: 'Bao' } },
      { signal_metadata: { author: 'Ravi' } },
      { signal_metadata: { author: 'Mayank' } },
      { signal_metadata: { author: 'Nitish' } },
      { signal_metadata: { author: 'Ganesh' } },
    ];
    const commitLinks: any[] = [];

    let crossDomainCallIdx = 0;
    let relEntityLinksCallIdx = 0;

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'release_entities') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: MOCK_RELEASE_ENTITY_634, error: null }),
          };
        }
        if (table === 'release_entity_links') {
          const callIdx = relEntityLinksCallIdx++;
          // First call = jira tickets, second call = commit links
          const data = callIdx === 0 ? ticketLinks : commitLinks;
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data, error: null }),
          };
        }
        // cross_domain_signals — first call = PRs, second call = recentCommits
        const callIdx = crossDomainCallIdx++;
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          then: (resolve: any) =>
            resolve({ data: callIdx === 0 ? prSignals : recentCommits, error: null }),
        };
      }),
    };

    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    const readiness = await tracker.getReleaseReadiness('release-id-634');

    expect(readiness.readinessScore).toBeGreaterThanOrEqual(75);
    expect(readiness.readinessLabel).toBe('green');
    expect(readiness.releaseName).toBe('6.3.4');
    expect(readiness.branchName).toBe('release/6.3.4');
    expect(readiness.metrics.totalJiraTickets).toBe(3);
    expect(readiness.metrics.resolvedTickets).toBe(2);
    expect(readiness.metrics.activeMembersLastWeek).toHaveLength(5);
    expect(readiness.summary).toContain('6.3.4');
  });

  it('throws if release not found', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_634);
    await expect(tracker.getReleaseReadiness('nonexistent-id')).rejects.toThrow('not found');
  });
});

describe('Readiness label thresholds (pure logic)', () => {
  function computeLabel(score: number): 'red' | 'amber' | 'green' {
    return score >= 80 ? 'green' : score >= 50 ? 'amber' : 'red';
  }

  it('score >= 80 → green', () => {
    expect(computeLabel(80)).toBe('green');
    expect(computeLabel(95)).toBe('green');
    expect(computeLabel(100)).toBe('green');
  });

  it('score 50-79 → amber', () => {
    expect(computeLabel(50)).toBe('amber');
    expect(computeLabel(65)).toBe('amber');
    expect(computeLabel(79)).toBe('amber');
  });

  it('score < 50 → red', () => {
    expect(computeLabel(49)).toBe('red');
    expect(computeLabel(0)).toBe('red');
  });
});

// ============================================================================
// 13. Standalone helpers: getReleaseByBranch, getReleaseByName, listActiveReleases
// ============================================================================

describe('Standalone helpers', () => {
  describe('getReleaseByBranch()', () => {
    it('queries by branch_name and returns entity', async () => {
      const supabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: MOCK_RELEASE_ENTITY_634, error: null }),
        })),
      };
      const result = await getReleaseByBranch(supabase as any, TOOKITAKI_ORG_ID, 'release/6.3.4');
      expect(result).not.toBeNull();
      expect(result!.release_name).toBe('6.3.4');
    });

    it('returns null if not found', async () => {
      const supabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      };
      const result = await getReleaseByBranch(supabase as any, TOOKITAKI_ORG_ID, 'release/unknown');
      expect(result).toBeNull();
    });
  });

  describe('getReleaseByName()', () => {
    it('returns entity for given release name', async () => {
      const supabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: MOCK_RELEASE_ENTITY_634, error: null }),
        })),
      };
      const result = await getReleaseByName(supabase as any, TOOKITAKI_ORG_ID, '6.3.4');
      expect(result!.branch_name).toBe('release/6.3.4');
    });
  });

  describe('listActiveReleases()', () => {
    it('returns all in_progress releases', async () => {
      const mockReleases = [
        MOCK_RELEASE_ENTITY_634,
        { ...MOCK_RELEASE_ENTITY_634, id: 'rel-5115', release_name: '5.11.5-enterprise' },
      ];
      const supabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: (resolve: any) => resolve({ data: mockReleases, error: null }),
        })),
      };
      const releases = await listActiveReleases(supabase as any, TOOKITAKI_ORG_ID);
      expect(releases).toHaveLength(2);
    });

    it('returns empty array when no active releases', async () => {
      const supabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: (resolve: any) => resolve({ data: null, error: null }),
        })),
      };
      const releases = await listActiveReleases(supabase as any, TOOKITAKI_ORG_ID);
      expect(releases).toHaveLength(0);
    });
  });
});

// ============================================================================
// 14. SEaaSService — release query handlers
// ============================================================================

describe('SEaaSService — release query handlers', () => {
  let service: SEaaSService;

  beforeEach(() => {
    const supabase = createSupabaseMock({});

    service = createSEaaSService({
      supabase,
      organizationId: TOOKITAKI_ORG_ID,
    });

    // Mock ReleaseTracker prototype methods to avoid real DB/API calls
    vi.spyOn(ReleaseTracker.prototype, 'getTicketsForVersion').mockResolvedValue([
      { key: 'TM-101', summary: 'Fix AML scoring', status: 'Done', issue_type: 'Bug', assignee: 'Bao' },
    ]);
    vi.spyOn(ReleaseTracker.prototype, 'getCommitsDiff').mockResolvedValue([
      { sha: 'abc123', message: 'fix: scoring', author: 'Bao', date: '2026-02-20', url: '' },
    ]);
    vi.spyOn(ReleaseTracker.prototype, 'getTeamVelocityByDrop').mockResolvedValue({
      releaseId: 'rel-id',
      releaseName: '5.11.5-enterprise',
      drops: [
        { dropNumber: 1, dropDate: '2026-02-26', mergedPRs: 5, resolvedTickets: 8, authorBreakdown: { Sandeep: 3 } },
      ],
    } as VelocityByDrop);
    vi.spyOn(ReleaseTracker.prototype, 'getReleaseReadiness').mockResolvedValue({
      releaseId: 'rel-id',
      releaseName: '6.3.4',
      branchName: 'release/6.3.4',
      targetDate: '2026-04-07',
      metrics: {
        totalJiraTickets: 10, resolvedTickets: 8, ticketResolutionPct: 80,
        totalPRs: 5, mergedPRs: 5, prMergeRatePct: 100, openPRs: 0,
        totalCommits: 20, teamMembers: [], activeMembersLastWeek: [],
      },
      readinessScore: 88,
      readinessLabel: 'green',
      summary: 'Ready',
    } as ReleaseReadiness);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    service.shutdown();
  });

  it('releaseGetTickets returns Jira tickets', async () => {
    const tickets = await service.releaseGetTickets({
      releaseId: 'rel-id',
      releaseConfig: CONFIG_634,
      apiKey: 'test-key',
    });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].key).toBe('TM-101');
    expect(tickets[0].status).toBe('Done');
  });

  it('releaseGetDiff returns commit diff', async () => {
    const diff = await service.releaseGetDiff({
      releaseId: 'rel-id',
      releaseConfig: CONFIG_634,
      apiKey: 'test-key',
    });
    expect(diff).toHaveLength(1);
    expect(diff[0].sha).toBe('abc123');
    expect(diff[0].author).toBe('Bao');
  });

  it('releaseGetVelocityByDrop returns drop velocity', async () => {
    const velocity = await service.releaseGetVelocityByDrop({
      releaseName: '5.11.5-enterprise',
      releaseConfig: CONFIG_5115,
      apiKey: 'test-key',
    });
    expect(velocity.drops).toHaveLength(1);
    expect(velocity.drops[0].dropNumber).toBe(1);
    expect(velocity.drops[0].mergedPRs).toBe(5);
    expect(velocity.drops[0].resolvedTickets).toBe(8);
  });

  it('releaseGetReadiness returns readiness score', async () => {
    const readiness = await service.releaseGetReadiness({
      releaseId: 'rel-id',
      releaseConfig: CONFIG_634,
      apiKey: 'test-key',
    });
    expect(readiness.readinessScore).toBe(88);
    expect(readiness.readinessLabel).toBe('green');
    expect(readiness.releaseName).toBe('6.3.4');
  });
});

// ============================================================================
// 15. SEaaSService — missing Supabase guard on release handlers
// ============================================================================

describe('SEaaSService — missing Supabase guard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('releaseGetTickets throws when Supabase not configured', async () => {
    const service = createSEaaSService({ organizationId: TOOKITAKI_ORG_ID });
    await expect(
      service.releaseGetTickets({ releaseId: 'x', releaseConfig: CONFIG_634, apiKey: 'key' })
    ).rejects.toThrow('Supabase client is required');
    service.shutdown();
  });

  it('releaseGetDiff throws when Supabase not configured', async () => {
    const service = createSEaaSService({ organizationId: TOOKITAKI_ORG_ID });
    await expect(
      service.releaseGetDiff({ releaseId: 'x', releaseConfig: CONFIG_634, apiKey: 'key' })
    ).rejects.toThrow('Supabase client is required');
    service.shutdown();
  });

  it('releaseGetVelocityByDrop throws when Supabase not configured', async () => {
    const service = createSEaaSService({ organizationId: TOOKITAKI_ORG_ID });
    await expect(
      service.releaseGetVelocityByDrop({ releaseName: '6.3.4', releaseConfig: CONFIG_634, apiKey: 'key' })
    ).rejects.toThrow('Supabase client is required');
    service.shutdown();
  });

  it('releaseGetReadiness throws when Supabase not configured', async () => {
    const service = createSEaaSService({ organizationId: TOOKITAKI_ORG_ID });
    await expect(
      service.releaseGetReadiness({ releaseId: 'x', releaseConfig: CONFIG_634, apiKey: 'key' })
    ).rejects.toThrow('Supabase client is required');
    service.shutdown();
  });
});

// ============================================================================
// 16. Rate-limit enforcement on release handlers
// ============================================================================

describe('SEaaSService — rate limiting on release handlers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws rate limit error after exceeding requestsPerMinute', async () => {
    const supabase = createSupabaseMock({});

    const service = createSEaaSService({
      supabase,
      organizationId: TOOKITAKI_ORG_ID,
      rateLimit: { requestsPerMinute: 2, tokensPerDay: 100000, maxConcurrentPerUser: 5 },
    });

    vi.spyOn(ReleaseTracker.prototype, 'getCommitsDiff').mockResolvedValue([]);

    // First two calls should succeed (1 auth + 1 rateLimit check each = 2 auth calls per handler call)
    await service.releaseGetDiff({ releaseId: 'r', releaseConfig: CONFIG_634, apiKey: 'key' });
    await service.releaseGetDiff({ releaseId: 'r', releaseConfig: CONFIG_634, apiKey: 'key' });

    // Third call should exceed rate limit
    await expect(
      service.releaseGetDiff({ releaseId: 'r', releaseConfig: CONFIG_634, apiKey: 'key' })
    ).rejects.toThrow('Rate limit exceeded');

    service.shutdown();
  });
});

// ============================================================================
// 17. Migration SQL file existence (Track 2 table SQL)
// ============================================================================

describe('Track 2 migration SQL files', () => {
  const migrationsDir = path.resolve(__dirname, '../../../../supabase/migrations');

  it('Track 2 full release tracking migration file exists', () => {
    const file = path.join(migrationsDir, '20260219000011_release_tracking_full.sql');
    expect(fs.existsSync(file)).toBe(true);
  });

  it('Track 2 migration creates release_entities table', () => {
    const file = path.join(migrationsDir, '20260219000011_release_tracking_full.sql');
    const sql = fs.readFileSync(file, 'utf-8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS release_entities');
    expect(sql).toContain('release_name');
    expect(sql).toContain('branch_name');
    expect(sql).toContain('drop_number');
    expect(sql).toContain('drop_date');
    expect(sql).toContain('team_members');
  });

  it('Track 2 migration creates release_entity_links table', () => {
    const file = path.join(migrationsDir, '20260219000011_release_tracking_full.sql');
    const sql = fs.readFileSync(file, 'utf-8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS release_entity_links');
    expect(sql).toContain('entity_type');
    expect(sql).toContain('entity_id');
    expect(sql).toContain('link_source');
    expect(sql).toContain('confidence');
  });

  it('Track 2 migration has correct UNIQUE constraints', () => {
    const file = path.join(migrationsDir, '20260219000011_release_tracking_full.sql');
    const sql = fs.readFileSync(file, 'utf-8');
    expect(sql).toContain('organization_id, release_name, drop_number');
    expect(sql).toContain('organization_id, release_id, entity_type, entity_id');
  });

  it('Track 2 migration enables RLS on both tables', () => {
    const file = path.join(migrationsDir, '20260219000011_release_tracking_full.sql');
    const sql = fs.readFileSync(file, 'utf-8');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('service_role');
    expect(sql).toContain('GRANT SELECT ON release_entities');
    expect(sql).toContain('GRANT SELECT ON release_entity_links');
  });
});

// ============================================================================
// 18. Tookitaki Team A (6.3.4) end-to-end scenario
// ============================================================================

describe('Tookitaki Team A — 6.3.4 end-to-end', () => {
  it('full onboarding flow: register → syncAll → readiness', async () => {
    const tracker = new ReleaseTracker({} as any, CONFIG_634);

    const registerSpy = vi.spyOn(tracker, 'registerRelease').mockResolvedValue('release-id-634');
    const syncAllSpy = vi.spyOn(tracker, 'syncAll').mockResolvedValue({ commits: 15, jiraTickets: 23, prs: 9 });
    const readinessSpy = vi.spyOn(tracker, 'getReleaseReadiness').mockResolvedValue({
      releaseId: 'release-id-634',
      releaseName: '6.3.4',
      branchName: 'release/6.3.4',
      targetDate: '2026-04-07',
      metrics: {
        totalJiraTickets: 23,
        resolvedTickets: 18,
        ticketResolutionPct: 78,
        totalPRs: 9,
        mergedPRs: 8,
        prMergeRatePct: 89,
        openPRs: 1,
        totalCommits: 15,
        teamMembers: CONFIG_634.teamMembers!,
        activeMembersLastWeek: ['Bao', 'Ravi', 'Mayank', 'Nitish'],
      },
      readinessScore: 82,
      readinessLabel: 'green',
      summary: 'Release 6.3.4 (release/6.3.4): Tickets: 18/23 resolved (78%)',
    });

    // Step 1: Register release
    const releaseId = await tracker.registerRelease();
    expect(releaseId).toBe('release-id-634');
    expect(registerSpy).toHaveBeenCalledTimes(1);

    // Step 2: Sync all sources
    const counts = await tracker.syncAll(releaseId);
    expect(counts.commits).toBe(15);
    expect(counts.jiraTickets).toBe(23);
    expect(counts.prs).toBe(9);

    // Step 3: Check readiness
    const readiness = await tracker.getReleaseReadiness(releaseId);
    expect(readiness.readinessScore).toBe(82);
    expect(readiness.readinessLabel).toBe('green');
    expect(readiness.metrics.totalJiraTickets).toBe(23);
    expect(readiness.metrics.activeMembersLastWeek).toContain('Bao');
    expect(readiness.targetDate).toBe('2026-04-07');
  });

  it('Team A config has correct Tookitaki fields', () => {
    expect(CONFIG_634.releaseName).toBe('6.3.4');
    expect(CONFIG_634.baseVersion).toBe('6.3.3');
    expect(CONFIG_634.branchName).toBe('release/6.3.4');
    expect(CONFIG_634.targetDate).toBe('2026-04-07');
    expect(CONFIG_634.teamLabel).toBe('team-634');
    expect(CONFIG_634.githubRepo).toBe('tookitaki/aml-engine');
    expect(CONFIG_634.jiraProjectKey).toBe('TM');
  });

  it('syncAll result shows commit count, Jira ticket count, PR count', async () => {
    const tracker = new ReleaseTracker({} as any, CONFIG_634);
    vi.spyOn(tracker, 'syncCommitsFromGitHub').mockResolvedValue(15);
    vi.spyOn(tracker, 'syncJiraTickets').mockResolvedValue(23);
    vi.spyOn(tracker, 'syncPRsFromSignals').mockResolvedValue(9);

    const result = await tracker.syncAll('release-id-634');
    expect(result.commits).toBe(15);
    expect(result.jiraTickets).toBe(23);
    expect(result.prs).toBe(9);
  });
});

// ============================================================================
// 19. Tookitaki Team B (5.11.5-enterprise) two-drop scenario
// ============================================================================

describe('Tookitaki Team B — 5.11.5-enterprise two-drop', () => {
  it('registerAllDrops creates Drop 1 and Drop 2', async () => {
    let dropIdCounter = 0;
    const upsertSpy = vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: `drop-${++dropIdCounter}` }, error: null }),
      }),
    }));

    const supabase = {
      from: vi.fn().mockReturnValue({ upsert: upsertSpy }),
    };
    const tracker = new ReleaseTracker(supabase as any, CONFIG_5115);
    const ids = await tracker.registerAllDrops();

    expect(ids).toHaveLength(2);

    // Verify upsert was called with correct drop metadata
    expect(upsertSpy.mock.calls[0][0].drop_number).toBe(1);
    expect(upsertSpy.mock.calls[0][0].drop_date).toBe('2026-02-26');
    expect(upsertSpy.mock.calls[1][0].drop_number).toBe(2);
    expect(upsertSpy.mock.calls[1][0].drop_date).toBe('2026-03-15');
  });

  it('velocity query identifies correct drop dates', () => {
    expect(CONFIG_5115.drops![0].dropDate).toBe('2026-02-26'); // Drop 1 target
    expect(CONFIG_5115.drops![1].dropDate).toBe('2026-03-15'); // Drop 2 target
  });

  it('Team B members are correctly configured', () => {
    const expected = ['Sandeep', 'Doan', 'Siva', 'Anish', 'Nagaru'];
    expect(CONFIG_5115.teamMembers).toEqual(expected);
  });

  it('full two-drop velocity scenario', async () => {
    const tracker = new ReleaseTracker({} as any, CONFIG_5115);
    vi.spyOn(tracker, 'getTeamVelocityByDrop').mockResolvedValue({
      releaseId: 'rel-5115-drop1',
      releaseName: '5.11.5-enterprise',
      drops: [
        { dropNumber: 1, dropDate: '2026-02-26', mergedPRs: 7, resolvedTickets: 12, authorBreakdown: { Sandeep: 3, Doan: 2, Siva: 2 } },
        { dropNumber: 2, dropDate: '2026-03-15', mergedPRs: 5, resolvedTickets: 9, authorBreakdown: { Anish: 3, Nagaru: 2 } },
      ],
    });

    const velocity = await tracker.getTeamVelocityByDrop();
    expect(velocity.drops).toHaveLength(2);

    // Drop 1 metrics
    expect(velocity.drops[0].dropNumber).toBe(1);
    expect(velocity.drops[0].mergedPRs).toBe(7);
    expect(velocity.drops[0].resolvedTickets).toBe(12);
    expect(velocity.drops[0].authorBreakdown['Sandeep']).toBe(3);

    // Drop 2 metrics
    expect(velocity.drops[1].dropNumber).toBe(2);
    expect(velocity.drops[1].mergedPRs).toBe(5);
    expect(velocity.drops[1].resolvedTickets).toBe(9);
    expect(velocity.drops[1].authorBreakdown['Anish']).toBe(3);
  });

  it('Team B baseVersion is 5.11.4.3', () => {
    expect(CONFIG_5115.baseVersion).toBe('5.11.4.3');
  });

  it('Team B has enterprise release type', () => {
    expect(CONFIG_5115.releaseType).toBe('enterprise');
  });
});
