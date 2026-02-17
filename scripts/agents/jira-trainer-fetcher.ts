/**
 * JIRA Trainer — Apache JIRA Data Fetcher
 *
 * Pulls issues, transitions, comments, and sprint data from Apache's public
 * JIRA instance (issues.apache.org). Covers Kafka, Spark, Hadoop, Flink,
 * Cassandra, HBase, Hive — world-class engineering teams with real Jira workflows.
 *
 * No authentication needed — Apache JIRA is fully public read-only.
 * Rate limit: ~5 req/sec (self-imposed to be a good citizen).
 */

// ============================================================================
// TYPES
// ============================================================================

export interface JiraIssue {
  key: string;              // e.g. "KAFKA-20191"
  id: string;
  summary: string;
  issueType: string;        // Bug, Improvement, Task, Sub-task, New Feature, Wish, Test
  priority: string;         // Blocker, Critical, Major, Minor, Trivial
  status: string;           // Open, In Progress, Patch Available, Resolved, Closed, Reopened
  resolution: string | null; // Fixed, Won't Fix, Duplicate, Invalid, Not A Problem, etc.
  created: string;          // ISO date
  updated: string;
  resolved: string | null;  // resolutiondate
  assignee: string | null;
  reporter: string;
  labels: string[];
  components: string[];
  fixVersions: string[];
  commentCount: number;
  transitions: JiraTransition[];
}

export interface JiraTransition {
  timestamp: string;
  author: string;
  field: string;        // "status", "priority", "assignee", "resolution", etc.
  fromValue: string;
  toValue: string;
}

export interface JiraProjectData {
  project: string;       // e.g. "KAFKA"
  issues: JiraIssue[];
  fetchedAt: Date;
}

export interface JiraFetchOptions {
  /** Max issues per project (default: 500) */
  maxIssues?: number;
  /** Fetch changelog/transitions (default: true) */
  fetchChangelog?: boolean;
  /** Only fetch data since this date (ISO string) */
  since?: string;
  /** Rate limit delay between requests in ms (default: 200) */
  rateLimitDelay?: number;
}

// ============================================================================
// APACHE JIRA API HELPER
// ============================================================================

const JIRA_BASE = 'https://issues.apache.org/jira/rest/api/2';
const FETCH_TIMEOUT_MS = 20_000; // 20 seconds per request

async function jiraFetch(endpoint: string, _retryCount: number = 0): Promise<any> {
  const MAX_RETRIES = 3;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${JIRA_BASE}${endpoint}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NexusBrain-JiraTrainer/1.0',
      },
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError' && _retryCount < MAX_RETRIES) {
      console.log(`[JiraFetcher] Timeout on ${endpoint}, retry ${_retryCount + 1}/${MAX_RETRIES}`);
      await sleep(2000);
      return jiraFetch(endpoint, _retryCount + 1);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    // Rate limited — back off
    const retryAfter = parseInt(response.headers.get('Retry-After') || '10', 10);
    console.log(`[JiraFetcher] Rate limited. Waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return jiraFetch(endpoint, _retryCount);
  }

  if (!response.ok) {
    if (_retryCount < MAX_RETRIES && response.status >= 500) {
      console.log(`[JiraFetcher] Server error ${response.status} on ${endpoint}, retry ${_retryCount + 1}/${MAX_RETRIES}`);
      await sleep(3000);
      return jiraFetch(endpoint, _retryCount + 1);
    }
    const body = await response.text().catch(() => '');
    throw new Error(`JIRA API ${response.status}: ${body.substring(0, 200)}`);
  }

  return response.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

/**
 * Fetch issues from a single Apache JIRA project with changelog (transitions).
 */
async function fetchProjectIssues(
  project: string,
  options: JiraFetchOptions,
): Promise<JiraIssue[]> {
  const maxIssues = options.maxIssues || 500;
  const delay = options.rateLimitDelay || 200;
  const fetchChangelog = options.fetchChangelog !== false;

  const issues: JiraIssue[] = [];
  let startAt = 0;
  const pageSize = 50; // JIRA default max

  // Build JQL
  let jql = `project=${project}`;
  if (options.since) {
    // Apache JIRA uses "yyyy/MM/dd HH:mm" format
    const sinceDate = new Date(options.since);
    const formatted = `${sinceDate.getFullYear()}/${String(sinceDate.getMonth() + 1).padStart(2, '0')}/${String(sinceDate.getDate()).padStart(2, '0')}`;
    jql += ` AND updated >= "${formatted}"`;
  }
  // Get most recently updated first
  jql += ' ORDER BY updated DESC';

  const fields = 'summary,status,priority,issuetype,assignee,reporter,created,updated,resolutiondate,resolution,components,fixVersions,labels,comment';
  const expand = fetchChangelog ? 'changelog' : '';

  while (issues.length < maxIssues) {
    try {
      const encodedJql = encodeURIComponent(jql);
      const endpoint = `/search?jql=${encodedJql}&startAt=${startAt}&maxResults=${pageSize}&fields=${fields}${expand ? `&expand=${expand}` : ''}`;
      const data = await jiraFetch(endpoint);

      if (!data.issues || data.issues.length === 0) break;

      for (const raw of data.issues) {
        const f = raw.fields;
        const transitions: JiraTransition[] = [];

        // Extract changelog transitions
        if (fetchChangelog && raw.changelog) {
          for (const history of raw.changelog.histories || []) {
            for (const item of history.items || []) {
              // Only track meaningful field changes
              if (['status', 'priority', 'assignee', 'resolution', 'Fix Version'].includes(item.field)) {
                transitions.push({
                  timestamp: history.created,
                  author: history.author?.displayName || history.author?.name || 'unknown',
                  field: item.field,
                  fromValue: item.fromString || '',
                  toValue: item.toString || '',
                });
              }
            }
          }
        }

        issues.push({
          key: raw.key,
          id: raw.id,
          summary: f.summary || '',
          issueType: f.issuetype?.name || 'Unknown',
          priority: f.priority?.name || 'Major',
          status: f.status?.name || 'Open',
          resolution: f.resolution?.name || null,
          created: f.created,
          updated: f.updated,
          resolved: f.resolutiondate || null,
          assignee: f.assignee?.displayName || f.assignee?.name || null,
          reporter: f.reporter?.displayName || f.reporter?.name || 'unknown',
          labels: f.labels || [],
          components: (f.components || []).map((c: any) => c.name),
          fixVersions: (f.fixVersions || []).map((v: any) => v.name),
          commentCount: f.comment?.total || 0,
          transitions,
        });
      }

      startAt += data.issues.length;
      if (startAt >= data.total || data.issues.length < pageSize) break;
      if (issues.length >= maxIssues) break;

      await sleep(delay);
    } catch (err) {
      console.log(`[JiraFetcher] [${project}] Error at offset ${startAt}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }

  return issues.slice(0, maxIssues);
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Fetch all configured Apache JIRA projects.
 */
export async function fetchAllJiraProjects(
  projects: string[],
  options: JiraFetchOptions = {},
): Promise<JiraProjectData[]> {
  const results: JiraProjectData[] = [];
  const delay = options.rateLimitDelay || 200;

  console.log(`[JiraFetcher] Fetching data from ${projects.length} Apache JIRA projects...`);

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    console.log(`[${i + 1}/${projects.length}] -- ${project} --`);

    try {
      const issues = await fetchProjectIssues(project, options);

      const data: JiraProjectData = {
        project,
        issues,
        fetchedAt: new Date(),
      };

      results.push(data);

      // Count stats
      const bugs = issues.filter(i => i.issueType === 'Bug').length;
      const resolved = issues.filter(i => i.resolved).length;
      const withTransitions = issues.filter(i => i.transitions.length > 0).length;
      console.log(`[JiraFetcher] [${project}] DONE: ${issues.length} issues (${bugs} bugs, ${resolved} resolved, ${withTransitions} with transitions)`);

      if (i < projects.length - 1) await sleep(delay);
    } catch (err) {
      console.log(`[JiraFetcher] [${project}] FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const totalIssues = results.reduce((sum, p) => sum + p.issues.length, 0);
  console.log(`[JiraFetcher] Complete: ${totalIssues} issues across ${results.length} projects`);

  return results;
}
