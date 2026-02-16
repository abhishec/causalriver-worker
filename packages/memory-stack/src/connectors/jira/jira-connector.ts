/**
 * Jira Connector
 * ==============
 * Ingests issues, comments, and project data via JQL search.
 * Optimized for 500K+ issues with paginated processing.
 */

import { ConnectorBase, IngestionResult } from '../base/connector-base.js';
import { RateLimitConfig } from '../base/rate-limiter.js';
import { Signal } from '../base/stream-processor.js';
import { Checkpoint } from '../base/checkpoint-manager.js';

interface JiraCredentials {
  accessToken: string;
  cloudId: string;
  siteUrl: string;
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: any;
    status: { name: string };
    priority: { name: string };
    issuetype: { name: string };
    assignee: { displayName: string } | null;
    reporter: { displayName: string };
    created: string;
    updated: string;
    comment: {
      comments: Array<{
        id: string;
        body: any;
        author: { displayName: string };
        created: string;
      }>;
    };
    labels: string[];
    project: { key: string; name: string };
  };
}

export class JiraConnector extends ConnectorBase {
  readonly connectorType = 'jira';

  constructor(
    organizationId: string,
    private jiraCreds: JiraCredentials,
    supabase: any,
    redis?: any
  ) {
    super(organizationId, jiraCreds, supabase, redis);
  }

  protected getRateLimits(): RateLimitConfig {
    return {
      requestsPerSecond: 10, // Jira Cloud rate limit
      backoffMultiplier: 2,
      maxRetries: 5,
      initialBackoffMs: 1000,
    };
  }

  /**
   * Initial load: Fetch all issues via JQL pagination
   */
  protected async initialLoad(): Promise<IngestionResult> {
    console.log('[Jira] Starting initial load...');
    let totalIssues = 0;
    let startAt = 0;
    const maxResults = 100;

    try {
      while (true) {
        // Fetch issues in batches using JQL
        const response = await this.rateLimiter.throttle(() =>
          this.searchIssues({
            jql: 'ORDER BY created DESC',
            startAt,
            maxResults,
            fields: [
              'summary',
              'description',
              'status',
              'priority',
              'issuetype',
              'assignee',
              'reporter',
              'created',
              'updated',
              'comment',
              'labels',
              'project',
            ],
          })
        );

        if (!response.issues || response.issues.length === 0) {
          break;
        }

        console.log(`[Jira] Processing issues ${startAt}-${startAt + response.issues.length} of ${response.total}`);

        // Process each issue + comments
        for (const issue of response.issues) {
          await this.ingestIssue(issue);
          await this.ingestComments(issue);
          totalIssues++;
        }

        startAt += maxResults;

        // Save checkpoint every 1000 issues
        if (totalIssues % 1000 === 0) {
          const progress = Math.min((startAt / response.total) * 100, 100);
          await this.saveCheckpoint(
            {
              lastIssueKey: response.issues[response.issues.length - 1].key,
              issuesProcessed: totalIssues,
              totalIssues: response.total,
            },
            Math.floor(progress)
          );
        }

        // Check if we've reached the end
        if (startAt >= response.total) {
          break;
        }
      }

      console.log(`[Jira] Initial load complete: ${totalIssues} issues`);
      return { success: true, signalsIngested: totalIssues };
    } catch (error: any) {
      console.error('[Jira] Initial load failed:', error);
      return { success: false, signalsIngested: totalIssues, errors: [error.message] };
    }
  }

  /**
   * Incremental sync: Only issues updated since last sync
   */
  protected async incrementalSync(): Promise<IngestionResult> {
    console.log('[Jira] Starting incremental sync...');
    let totalIssues = 0;

    try {
      const checkpoint = await this.checkpointManager.getCheckpoint(
        this.organizationId,
        this.connectorType
      );

      const lastSyncTime = checkpoint?.updated_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // JQL: updated >= last sync time
      const jql = `updated >= "${lastSyncTime.split('T')[0]}" ORDER BY updated DESC`;

      let startAt = 0;
      const maxResults = 100;

      while (true) {
        const response = await this.rateLimiter.throttle(() =>
          this.searchIssues({ jql, startAt, maxResults })
        );

        if (!response.issues || response.issues.length === 0) {
          break;
        }

        for (const issue of response.issues) {
          await this.ingestIssue(issue);
          await this.ingestComments(issue);
          totalIssues++;
        }

        startAt += maxResults;

        if (startAt >= response.total) {
          break;
        }
      }

      console.log(`[Jira] Incremental sync complete: ${totalIssues} updated issues`);
      return { success: true, signalsIngested: totalIssues };
    } catch (error: any) {
      console.error('[Jira] Incremental sync failed:', error);
      return { success: false, signalsIngested: totalIssues, errors: [error.message] };
    }
  }

  /**
   * Resume from checkpoint
   */
  protected async resumeIngestion(checkpoint: Checkpoint): Promise<IngestionResult> {
    console.log('[Jira] Resuming from checkpoint:', checkpoint.state);

    const lastIssueKey = checkpoint.state.lastIssueKey;
    const issuesProcessed = checkpoint.state.issuesProcessed || 0;

    // Resume by continuing from last issue
    let totalIssues = issuesProcessed;
    let startAt = issuesProcessed;
    const maxResults = 100;

    while (true) {
      const response = await this.rateLimiter.throttle(() =>
        this.searchIssues({
          jql: 'ORDER BY created DESC',
          startAt,
          maxResults,
        })
      );

      if (!response.issues || response.issues.length === 0) {
        break;
      }

      for (const issue of response.issues) {
        await this.ingestIssue(issue);
        await this.ingestComments(issue);
        totalIssues++;
      }

      startAt += maxResults;

      const progress = Math.min((startAt / response.total) * 100, 100);
      await this.saveCheckpoint(
        {
          lastIssueKey: response.issues[response.issues.length - 1].key,
          issuesProcessed: totalIssues,
          totalIssues: response.total,
        },
        Math.floor(progress)
      );

      if (startAt >= response.total) {
        break;
      }
    }

    return { success: true, signalsIngested: totalIssues };
  }

  /**
   * Search issues via JQL
   */
  private async searchIssues(params: {
    jql: string;
    startAt: number;
    maxResults: number;
    fields?: string[];
  }): Promise<any> {
    return this.jiraFetch('/rest/api/3/search', {
      method: 'POST',
      body: JSON.stringify({
        jql: params.jql,
        startAt: params.startAt,
        maxResults: params.maxResults,
        fields: params.fields || ['summary', 'description', 'status', 'comment'],
      }),
    });
  }

  /**
   * Ingest single issue
   */
  private async ingestIssue(issue: JiraIssue): Promise<void> {
    const description = this.extractText(issue.fields.description);

    const eventTime = issue.fields.updated;
    const signal: Signal = {
      source_domain: 'engineering.jira',
      signal_type: 'jira_issue',
      signal_value: 1,
      entity_type: 'issue',
      entity_id: `jira#${issue.key}`,
      signal_metadata: {
        source: 'jira',
        content: `${issue.fields.summary}\n\n${description}`,
        issue_key: issue.key,
        issue_type: issue.fields.issuetype.name,
        status: issue.fields.status.name,
        priority: issue.fields.priority?.name,
        assignee: issue.fields.assignee?.displayName,
        reporter: issue.fields.reporter.displayName,
        labels: issue.fields.labels,
        project: issue.fields.project.key,
        project_name: issue.fields.project.name,
      },
      organization_id: this.organizationId,
      created_at: eventTime,
      signal_timestamp: eventTime,
    };

    await this.streamProcessor.addSignal(signal);
  }

  /**
   * Ingest comments for an issue
   */
  private async ingestComments(issue: JiraIssue): Promise<void> {
    if (!issue.fields.comment?.comments) return;

    for (const comment of issue.fields.comment.comments) {
      const commentText = this.extractText(comment.body);

      const commentTime = comment.created;
      const signal: Signal = {
        source_domain: 'engineering.jira',
        signal_type: 'jira_comment',
        signal_value: 1,
        entity_type: 'comment',
        entity_id: `jira#${issue.key}_comment#${comment.id}`,
        signal_metadata: {
          source: 'jira',
          content: commentText,
          issue_key: issue.key,
          comment_id: comment.id,
          author: comment.author.displayName,
          project: issue.fields.project.key,
        },
        organization_id: this.organizationId,
        created_at: commentTime,
        signal_timestamp: commentTime,
      };

      await this.streamProcessor.addSignal(signal);
    }
  }

  /**
   * Extract plain text from Jira ADF (Atlassian Document Format)
   */
  private extractText(adf: any): string {
    if (!adf) return '';

    if (typeof adf === 'string') {
      return adf;
    }

    if (adf.type === 'doc' && adf.content) {
      return adf.content.map((node: any) => this.extractText(node)).join('\n');
    }

    if (adf.type === 'paragraph' && adf.content) {
      return adf.content.map((node: any) => this.extractText(node)).join('');
    }

    if (adf.type === 'text') {
      return adf.text || '';
    }

    if (adf.content) {
      return adf.content.map((node: any) => this.extractText(node)).join('\n');
    }

    return '';
  }

  /**
   * Jira API fetch helper
   */
  private async jiraFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `https://api.atlassian.com/ex/jira/${this.jiraCreds.cloudId}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.jiraCreds.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Jira API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  protected transformToSignal(rawData: any): Signal {
    throw new Error('Use ingestIssue/ingestComments');
  }
}
