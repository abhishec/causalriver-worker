/**
 * GitHub Discussions Trainer — Data Fetcher
 *
 * Pulls threaded discussions from major GitHub repos using the GraphQL API.
 * This is the best public proxy for Slack-style team communication:
 * - Categories ≈ Channels
 * - Comments ≈ Thread replies
 * - isAnswered ≈ Resolution
 * - Upvotes ≈ Reactions
 *
 * Target repos: Next.js, React, Rust, Vercel, Svelte, Vue, Deno
 *
 * Requires: GITHUB_TOKEN env var for GraphQL API access.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface DiscussionData {
  id: string;
  number: number;
  title: string;
  category: string;         // e.g. "Help", "Ideas", "General", "Show and Tell"
  author: string;
  createdAt: string;         // ISO date
  updatedAt: string;
  isAnswered: boolean;
  upvoteCount: number;
  commentCount: number;
  comments: DiscussionComment[];
}

export interface DiscussionComment {
  author: string;
  createdAt: string;
  isAnswer: boolean;
  upvoteCount: number;
}

export interface RepoDiscussionData {
  owner: string;
  repo: string;
  discussions: DiscussionData[];
  fetchedAt: Date;
}

export interface DiscussionFetchOptions {
  /** Max discussions per repo (default: 300) */
  maxDiscussions?: number;
  /** Only fetch discussions updated since this date (ISO string) */
  since?: string;
  /** Rate limit delay between requests in ms (default: 100) */
  rateLimitDelay?: number;
}

// ============================================================================
// GITHUB GRAPHQL HELPER
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function graphqlFetch(query: string, variables: Record<string, any> = {}): Promise<any> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN required for GitHub Discussions GraphQL API');
  }

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'NexusBrain-DiscussionsTrainer/1.0',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub GraphQL ${response.status}: ${body.substring(0, 300)}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors).substring(0, 300)}`);
  }

  return json.data;
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

const DISCUSSIONS_QUERY = `
query($owner: String!, $repo: String!, $cursor: String, $first: Int!) {
  repository(owner: $owner, name: $repo) {
    discussions(first: $first, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage, endCursor }
      nodes {
        id
        number
        title
        category { name }
        author { login }
        createdAt
        updatedAt
        isAnswered
        upvoteCount
        comments(first: 20) {
          totalCount
          nodes {
            author { login }
            createdAt
            isAnswer
            upvoteCount
          }
        }
      }
    }
  }
}`;

async function fetchRepoDiscussions(
  owner: string,
  repo: string,
  options: DiscussionFetchOptions,
): Promise<DiscussionData[]> {
  const maxDiscussions = options.maxDiscussions || 300;
  const delay = options.rateLimitDelay || 100;
  const sinceDate = options.since ? new Date(options.since) : null;

  const discussions: DiscussionData[] = [];
  let cursor: string | null = null;
  const pageSize = 50;

  while (discussions.length < maxDiscussions) {
    try {
      const data = await graphqlFetch(DISCUSSIONS_QUERY, {
        owner,
        repo,
        cursor,
        first: Math.min(pageSize, maxDiscussions - discussions.length),
      });

      const conn = data?.repository?.discussions;
      if (!conn || !conn.nodes || conn.nodes.length === 0) break;

      let hitOldData = false;
      for (const node of conn.nodes) {
        // Skip if older than since date
        if (sinceDate && new Date(node.updatedAt) < sinceDate) {
          hitOldData = true;
          break;
        }

        discussions.push({
          id: node.id,
          number: node.number,
          title: node.title,
          category: node.category?.name || 'General',
          author: node.author?.login || 'unknown',
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          isAnswered: node.isAnswered ?? false,
          upvoteCount: node.upvoteCount ?? 0,
          commentCount: node.comments?.totalCount ?? 0,
          comments: (node.comments?.nodes || []).map((c: any) => ({
            author: c.author?.login || 'unknown',
            createdAt: c.createdAt,
            isAnswer: c.isAnswer ?? false,
            upvoteCount: c.upvoteCount ?? 0,
          })),
        });
      }

      if (hitOldData) break;
      if (!conn.pageInfo.hasNextPage) break;
      cursor = conn.pageInfo.endCursor;

      await sleep(delay);
    } catch (err) {
      console.log(`[DiscussionsFetcher] [${owner}/${repo}] Error: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }

  return discussions.slice(0, maxDiscussions);
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function fetchAllDiscussions(
  repos: string[],
  options: DiscussionFetchOptions = {},
): Promise<RepoDiscussionData[]> {
  const results: RepoDiscussionData[] = [];
  const delay = options.rateLimitDelay || 100;

  console.log(`[DiscussionsFetcher] Fetching discussions from ${repos.length} repos...`);

  for (let i = 0; i < repos.length; i++) {
    const [owner, repo] = repos[i].split('/');
    console.log(`[${i + 1}/${repos.length}] -- ${owner}/${repo} --`);

    try {
      const discussions = await fetchRepoDiscussions(owner, repo, options);

      results.push({
        owner,
        repo,
        discussions,
        fetchedAt: new Date(),
      });

      const answered = discussions.filter(d => d.isAnswered).length;
      const totalComments = discussions.reduce((sum, d) => sum + d.commentCount, 0);
      console.log(`[DiscussionsFetcher] [${owner}/${repo}] DONE: ${discussions.length} discussions (${answered} answered, ${totalComments} comments)`);

      if (i < repos.length - 1) await sleep(delay);
    } catch (err) {
      console.log(`[DiscussionsFetcher] [${owner}/${repo}] FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const totalDiscussions = results.reduce((sum, r) => sum + r.discussions.length, 0);
  console.log(`[DiscussionsFetcher] Complete: ${totalDiscussions} discussions across ${results.length} repos`);

  return results;
}
