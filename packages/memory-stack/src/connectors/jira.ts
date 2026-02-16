/**
 * Jira Connector
 *
 * Syncs engineering/project management signals from Jira:
 *   - Issues (created, resolved, blocked)
 *   - Bugs (opened, closed with resolution time)
 *   - Sprint metrics (velocity, scope changes)
 *
 * These signals feed the causal graph to discover relationships like:
 *   sprint_scope_change → velocity_drop → deploy_delay
 *   bug_density → support_ticket_volume → churn
 *
 * Also feeds the Contributor Expertise Graph via issue resolution signals.
 *
 * @example
 * ```typescript
 * const jira = createJiraConnector({
 *   baseUrl: 'https://company.atlassian.net',
 *   email: 'bot@company.com',
 *   apiToken: process.env.JIRA_API_TOKEN!,
 * });
 * const result = await jira.fullSync(supabase, 'org_123');
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal, NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';
import { enrichSignalWithNLP } from '../core/nlp/signal-enricher';

// ============================================================================
// TYPES
// ============================================================================

export interface JiraConnectorConfig {
  /** Jira base URL (e.g., "https://company.atlassian.net") */
  baseUrl: string;
  /** Account email for authentication */
  email: string;
  /** API token (from https://id.atlassian.com/manage-profile/security/api-tokens) */
  apiToken: string;
  /** Filter to specific Jira project keys (e.g., ["ENG", "INFRA"]) */
  projectKeys?: string[];
  /** Max results per query (default: 100) */
  maxResults?: number;
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { key: string } };
    issuetype: { name: string };
    priority?: { name: string };
    assignee?: { accountId: string; displayName: string; emailAddress?: string };
    reporter?: { accountId: string; displayName: string };
    labels: string[];
    created: string;
    updated: string;
    resolutiondate?: string;
    resolution?: { name: string };
    project: { key: string; name: string };
    fixVersions?: Array<{ name: string }>;
    components?: Array<{ name: string }>;
  };
}

interface JiraSprint {
  id: number;
  name: string;
  state: string; // 'closed' | 'active' | 'future'
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
}

interface JiraSprintReport {
  sprint: JiraSprint;
  completedIssues: JiraIssue[];
  issuesNotCompletedInCurrentSprint: JiraIssue[];
  puntedIssues: JiraIssue[];
}

// ============================================================================
// FACTORY
// ============================================================================

export function createJiraConnector(config: JiraConnectorConfig): NexusConnector {
  const {
    baseUrl,
    email,
    apiToken,
    projectKeys,
    maxResults = 100,
  } = config;

  const authHeader = `Basic ${btoa(`${email}:${apiToken}`)}`;

  const headers = {
    Authorization: authHeader,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  // ── Fetch helpers ────────────────────────────────────────────────

  async function fetchJSON<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  function buildJQL(since?: Date): string {
    const parts: string[] = [];

    if (projectKeys && projectKeys.length > 0) {
      parts.push(`project IN (${projectKeys.join(',')})`);
    }

    if (since) {
      const dateStr = since.toISOString().split('T')[0];
      parts.push(`updated >= "${dateStr}"`);
    }

    parts.push('ORDER BY updated DESC');
    return parts.join(' AND ');
  }

  async function searchIssues(since?: Date): Promise<JiraIssue[]> {
    const jql = buildJQL(since);
    const allIssues: JiraIssue[] = [];
    let startAt = 0;

    // Paginate through all results for 500K+ scale
    while (true) {
      const data = await fetchJSON<{ issues: JiraIssue[]; total: number; startAt: number; maxResults: number }>(
        '/rest/api/3/search',
        {
          jql,
          startAt: String(startAt),
          maxResults: String(maxResults),
          fields: 'summary,status,issuetype,priority,assignee,reporter,labels,created,updated,resolutiondate,resolution,project,fixVersions,components',
        }
      );

      const issues = data.issues || [];
      allIssues.push(...issues);

      // Break if we've fetched all issues or hit a single-page result
      if (issues.length < maxResults || allIssues.length >= data.total) {
        break;
      }

      startAt += issues.length;

      // Rate limit: 50ms pause between pages to respect Jira API limits
      await new Promise(r => setTimeout(r, 50));
    }

    return allIssues;
  }

  async function fetchBoards(): Promise<Array<{ id: number; name: string }>> {
    try {
      const data = await fetchJSON<{ values: Array<{ id: number; name: string; type: string }> }>(
        '/rest/agile/1.0/board',
        { maxResults: '50' }
      );
      return data.values || [];
    } catch {
      return []; // Agile API may not be available
    }
  }

  async function fetchClosedSprints(boardId: number, since?: Date): Promise<JiraSprint[]> {
    try {
      const data = await fetchJSON<{ values: JiraSprint[] }>(
        `/rest/agile/1.0/board/${boardId}/sprint`,
        { state: 'closed', maxResults: '10' }
      );
      const sprints = data.values || [];
      if (since) {
        return sprints.filter((s) => s.completeDate && new Date(s.completeDate) >= since);
      }
      return sprints;
    } catch {
      return [];
    }
  }

  async function fetchSprintReport(boardId: number, sprintId: number): Promise<JiraSprintReport | null> {
    try {
      return await fetchJSON<JiraSprintReport>(
        `/rest/greenhopper/1.0/rapid/charts/sprintreport`,
        { rapidViewId: String(boardId), sprintId: String(sprintId) }
      );
    } catch {
      return null;
    }
  }

  // ── Signal transformers ──────────────────────────────────────────

  function issuesToSignals(issues: JiraIssue[], orgId: string): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const issue of issues) {
      const { fields } = issue;
      const isBug = fields.issuetype.name.toLowerCase() === 'bug' ||
                     fields.labels.some((l) => ['bug', 'defect'].includes(l.toLowerCase()));
      const isBlocked = fields.status.name.toLowerCase().includes('blocked') ||
                        fields.labels.some((l) => l.toLowerCase() === 'blocked');
      const statusCategory = fields.status.statusCategory.key; // 'new' | 'indeterminate' | 'done'

      const baseMetadata: Record<string, unknown> = {
        key: issue.key,
        summary: fields.summary,
        project: fields.project.key,
        issue_type: fields.issuetype.name,
        priority: fields.priority?.name,
        labels: fields.labels,
        assignee: fields.assignee?.displayName,
        assignee_id: fields.assignee?.accountId,
        reporter: fields.reporter?.displayName,
        components: fields.components?.map((c) => c.name),
      };

      // Issue created signal — enriched with NLP from summary
      const createdSignal: ConnectorSignal = {
        organization_id: orgId,
        source_domain: 'engineering.jira',
        signal_type: 'issue_created',
        signal_value: isBug ? -0.5 : 0.5,
        entity_type: 'jira_issue',
        entity_id: `jira_${issue.key}`,
        signal_timestamp: fields.created,
        metadata: {
          ...baseMetadata,
          is_bug: isBug,
        },
      };
      enrichSignalWithNLP(createdSignal, ['summary']);
      signals.push(createdSignal);

      // Issue resolved / closed
      if (statusCategory === 'done' && fields.resolutiondate) {
        const resolutionDays =
          (new Date(fields.resolutiondate).getTime() - new Date(fields.created).getTime()) /
          (1000 * 60 * 60 * 24);

        signals.push({
          organization_id: orgId,
          source_domain: 'engineering.jira',
          signal_type: 'issue_resolved',
          signal_value: 1,
          entity_type: 'jira_issue',
          entity_id: `jira_${issue.key}`,
          signal_timestamp: fields.resolutiondate,
          metadata: {
            ...baseMetadata,
            is_bug: isBug,
            resolution: fields.resolution?.name,
            resolution_time_days: Math.round(resolutionDays * 10) / 10,
          },
        });
      }

      // Blocked signal — enriched with NLP
      if (isBlocked) {
        const blockedSignal: ConnectorSignal = {
          organization_id: orgId,
          source_domain: 'engineering.jira',
          signal_type: 'issue_blocked',
          signal_value: -0.7,
          entity_type: 'jira_issue',
          entity_id: `jira_${issue.key}`,
          signal_timestamp: fields.updated,
          metadata: baseMetadata,
        };
        enrichSignalWithNLP(blockedSignal, ['summary']);
        signals.push(blockedSignal);
      }
    }

    return signals;
  }

  function sprintToSignals(
    sprint: JiraSprint,
    completedCount: number,
    committedCount: number,
    puntedCount: number,
    orgId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    const velocity = committedCount > 0 ? completedCount / committedCount : 0;

    // Sprint completed signal — enriched with NLP from sprint goal
    const sprintSignal: ConnectorSignal = {
      organization_id: orgId,
      source_domain: 'engineering.jira',
      signal_type: 'sprint_completed',
      signal_value: Math.min(velocity, 1),
      entity_type: 'sprint',
      entity_id: `sprint_${sprint.id}`,
      signal_timestamp: sprint.completeDate || sprint.endDate,
      metadata: {
        sprint_name: sprint.name,
        sprint_goal: sprint.goal,
        committed_issues: committedCount,
        completed_issues: completedCount,
        velocity_ratio: Math.round(velocity * 100) / 100,
      },
    };
    enrichSignalWithNLP(sprintSignal, ['sprint_goal']);
    signals.push(sprintSignal);

    // Scope change (punted issues = scope reduction)
    if (puntedCount > 0) {
      signals.push({
        organization_id: orgId,
        source_domain: 'engineering.jira',
        signal_type: 'sprint_scope_changed',
        signal_value: -0.3,
        entity_type: 'sprint',
        entity_id: `sprint_${sprint.id}`,
        signal_timestamp: sprint.completeDate || sprint.endDate,
        metadata: {
          sprint_name: sprint.name,
          punted_issues: puntedCount,
          committed_issues: committedCount,
        },
      });
    }

    return signals;
  }

  // ── Connector Interface ──────────────────────────────────────────

  return {
    id: 'jira',
    name: 'Jira',
    domain: 'engineering',

    async fullSync(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();
      const errors: string[] = [];
      const allSignals: ConnectorSignal[] = [];
      let recordsProcessed = 0;

      try {
        // Sync issues
        const issues = await searchIssues();
        allSignals.push(...issuesToSignals(issues, organizationId));
        recordsProcessed += issues.length;

        // Sync sprints
        const boards = await fetchBoards();
        for (const board of boards) {
          const sprints = await fetchClosedSprints(board.id);
          for (const sprint of sprints) {
            const report = await fetchSprintReport(board.id, sprint.id);
            if (report) {
              const completed = report.completedIssues?.length || 0;
              const notCompleted = report.issuesNotCompletedInCurrentSprint?.length || 0;
              const punted = report.puntedIssues?.length || 0;
              const committed = completed + notCompleted + punted;

              allSignals.push(...sprintToSignals(sprint, completed, committed, punted, organizationId));
              recordsProcessed++;
            }
          }
        }

        await storeConnectorSignals(supabase, allSignals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: allSignals.length,
          recordsProcessed,
          errors,
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'jira', organizationId, result);
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [err.message],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };
      }
    },

    async incrementalSync(
      supabase: SupabaseClient,
      organizationId: string,
      since: Date
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();
      const errors: string[] = [];
      const allSignals: ConnectorSignal[] = [];
      let recordsProcessed = 0;

      try {
        const issues = await searchIssues(since);
        allSignals.push(...issuesToSignals(issues, organizationId));
        recordsProcessed += issues.length;

        const boards = await fetchBoards();
        for (const board of boards) {
          const sprints = await fetchClosedSprints(board.id, since);
          for (const sprint of sprints) {
            const report = await fetchSprintReport(board.id, sprint.id);
            if (report) {
              const completed = report.completedIssues?.length || 0;
              const notCompleted = report.issuesNotCompletedInCurrentSprint?.length || 0;
              const punted = report.puntedIssues?.length || 0;
              const committed = completed + notCompleted + punted;

              allSignals.push(...sprintToSignals(sprint, completed, committed, punted, organizationId));
              recordsProcessed++;
            }
          }
        }

        await storeConnectorSignals(supabase, allSignals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: allSignals.length,
          recordsProcessed,
          errors,
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, 'jira', organizationId, result);
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [err.message],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };
      }
    },

    handleWebhook(payload: unknown): ConnectorSignal[] {
      const event = payload as any;
      if (!event || !event.issue) return [];

      const signals: ConnectorSignal[] = [];
      const orgId = event.organization_id || '';
      const issue = event.issue;
      const fields = issue.fields || {};
      const webhookEvent = event.webhookEvent || event.issue_event_type_name || '';

      const isBug = fields.issuetype?.name?.toLowerCase() === 'bug';
      const baseMetadata: Record<string, unknown> = {
        key: issue.key,
        summary: fields.summary,
        project: fields.project?.key,
        issue_type: fields.issuetype?.name,
        assignee: fields.assignee?.displayName,
        assignee_id: fields.assignee?.accountId,
        labels: fields.labels || [],
      };

      // Issue created
      if (webhookEvent.includes('created')) {
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering.jira',
          signal_type: 'issue_created',
          signal_value: isBug ? -0.5 : 0.5,
          entity_type: 'jira_issue',
          entity_id: `jira_${issue.key}`,
          metadata: { ...baseMetadata, is_bug: isBug },
        });
      }

      // Issue updated — check for resolution
      if (webhookEvent.includes('updated') && event.changelog) {
        const statusChange = event.changelog.items?.find(
          (item: any) => item.field === 'status'
        );
        if (statusChange && statusChange.toString?.toLowerCase().includes('done')) {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.jira',
            signal_type: 'issue_resolved',
            signal_value: 1,
            entity_type: 'jira_issue',
            entity_id: `jira_${issue.key}`,
            metadata: { ...baseMetadata, is_bug: isBug },
          });
        }
      }

      return signals;
    },
  };
}
