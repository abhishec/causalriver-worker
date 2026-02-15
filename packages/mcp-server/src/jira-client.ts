/**
 * Lightweight Jira REST API client for the MCP server.
 *
 * Reads credentials from environment variables. Returns null config
 * when not configured so callers can degrade gracefully.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface JiraTicketDetails {
  key: string;
  id: string;
  summary: string;
  description: string;
  status: string;
  statusCategory: string;
  issueType: string;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  labels: string[];
  components: string[];
  created: string;
  updated: string;
  resolutionDate: string | null;
  resolution: string | null;
  comments: JiraComment[];
  linkedIssues: JiraLinkedIssue[];
}

export interface JiraComment {
  author: string;
  created: string;
  body: string;
}

export interface JiraLinkedIssue {
  type: string;
  key: string;
  summary: string;
  status: string;
}

// ============================================================================
// CONFIG
// ============================================================================

/**
 * Read Jira credentials from environment. Returns null if any are missing.
 */
export function getJiraConfig(): JiraConfig | null {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) return null;

  return { baseUrl: baseUrl.replace(/\/+$/, ''), email, apiToken };
}

// ============================================================================
// ADF HELPERS
// ============================================================================

/**
 * Convert Atlassian Document Format (ADF) to plain text.
 * Jira API v3 returns description and comment bodies as ADF.
 */
export function adfToPlainText(adf: unknown): string {
  if (!adf || typeof adf !== 'object') return '';
  const node = adf as Record<string, unknown>;

  if (node.type === 'text' && typeof node.text === 'string') {
    return node.text;
  }

  if (Array.isArray(node.content)) {
    const childText = (node.content as unknown[]).map(adfToPlainText).join('');
    const type = node.type as string;

    if (['paragraph', 'heading', 'blockquote'].includes(type)) {
      return childText + '\n';
    }
    if (type === 'bulletList' || type === 'orderedList') {
      return childText + '\n';
    }
    if (type === 'listItem') {
      return '- ' + childText;
    }
    if (type === 'codeBlock') {
      return '```\n' + childText + '```\n';
    }
    return childText;
  }

  return '';
}

/**
 * Convert plain text / markdown to ADF for posting as Jira comments.
 * Splits on double newlines into paragraphs.
 */
export function markdownToAdf(text: string): Record<string, unknown> {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  return {
    type: 'doc',
    version: 1,
    content: paragraphs.map((para) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: para.replace(/\n/g, ' ').trim() }],
    })),
  };
}

// ============================================================================
// CLIENT FACTORY
// ============================================================================

export function createJiraClient(config: JiraConfig) {
  const authHeader = `Basic ${btoa(`${config.email}:${config.apiToken}`)}`;

  const headers: Record<string, string> = {
    Authorization: authHeader,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  async function fetchJSON<T>(path: string): Promise<T> {
    const url = `${config.baseUrl}${path}`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const status = response.status;
      const body = await response.text().catch(() => '');
      if (status === 401) {
        throw new Error('Jira authentication failed. Check JIRA_EMAIL and JIRA_API_TOKEN.');
      }
      if (status === 404) {
        throw new Error(`Jira resource not found: ${path}`);
      }
      throw new Error(`Jira API error (${status}): ${body.slice(0, 200)}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    isConfigured: () => true,

    async getTicket(key: string): Promise<JiraTicketDetails> {
      const fields = [
        'summary', 'description', 'status', 'issuetype', 'priority',
        'assignee', 'reporter', 'labels', 'components', 'created',
        'updated', 'resolutiondate', 'resolution', 'comment', 'issuelinks',
      ].join(',');

      const data = await fetchJSON<any>(
        `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fields}`,
      );

      const f = data.fields || {};
      const comments = (f.comment?.comments || []).slice(-10);

      return {
        key: data.key,
        id: data.id,
        summary: f.summary || '',
        description: adfToPlainText(f.description),
        status: f.status?.name || 'Unknown',
        statusCategory: f.status?.statusCategory?.key || 'unknown',
        issueType: f.issuetype?.name || 'Unknown',
        priority: f.priority?.name || null,
        assignee: f.assignee?.displayName || null,
        reporter: f.reporter?.displayName || null,
        labels: f.labels || [],
        components: (f.components || []).map((c: any) => c.name),
        created: f.created || '',
        updated: f.updated || '',
        resolutionDate: f.resolutiondate || null,
        resolution: f.resolution?.name || null,
        comments: comments.map((c: any) => ({
          author: c.author?.displayName || 'Unknown',
          created: c.created || '',
          body: adfToPlainText(c.body),
        })),
        linkedIssues: (f.issuelinks || []).map((link: any) => {
          const inward = link.inwardIssue;
          const outward = link.outwardIssue;
          const linked = inward || outward;
          return {
            type: inward ? (link.type?.inward || 'related') : (link.type?.outward || 'related'),
            key: linked?.key || '',
            summary: linked?.fields?.summary || '',
            status: linked?.fields?.status?.name || '',
          };
        }).filter((l: JiraLinkedIssue) => l.key),
      };
    },

    async addComment(key: string, body: string): Promise<void> {
      const url = `${config.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}/comment`;
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body: markdownToAdf(body) }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to post Jira comment (${response.status}): ${text.slice(0, 200)}`);
      }
    },
  };
}
