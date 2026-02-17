/**
 * StackExchange Trainer — Fetcher
 *
 * Pulls high-quality Q&A data from StackOverflow & Code Review StackExchange.
 * Targets: testing patterns, SQL optimization, architecture, code quality.
 *
 * API: https://api.stackexchange.com/2.3
 * Auth: None required (300 req/day without key, 10K with free key).
 * Rate limit: 30 req/sec burst.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SEQuestion {
  question_id: number;
  title: string;
  tags: string[];
  score: number;
  answer_count: number;
  view_count: number;
  is_answered: boolean;
  accepted_answer_id?: number;
  creation_date: number;  // Unix epoch
  last_activity_date: number;
  link: string;
  owner: { display_name: string; reputation: number };
}

export interface SEAnswer {
  answer_id: number;
  question_id: number;
  score: number;
  is_accepted: boolean;
  creation_date: number;
  owner: { display_name: string; reputation: number };
}

export interface SETagInfo {
  name: string;
  count: number;       // total questions
  has_synonyms: boolean;
}

export interface TagCategoryData {
  category: string;           // e.g. 'testing', 'sql', 'architecture'
  site: string;               // 'stackoverflow' or 'codereview'
  tags: string[];             // tags queried
  questions: SEQuestion[];
  topAnswerers: Array<{ user: string; reputation: number; score: number }>;
  tagInfo: SETagInfo[];
  fetchedAt: Date;
}

export interface StackExchangeFetchOptions {
  /** Max pages per tag query (default: 3 = 300 questions) */
  maxPages?: number;
  /** Rate limit delay in ms between requests (default: 200) */
  rateLimitDelay?: number;
  /** StackExchange API key (optional, increases quota from 300→10K/day) */
  apiKey?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SE_API_BASE = 'https://api.stackexchange.com/2.3';

/**
 * Tag categories map to SE-aaS features:
 * - testing → Test Case Generator, Test Data Generator, TDD Code Gen
 * - sql → SQL Query Analyzer
 * - architecture → Architecture Extractor, HLD/LLD Generator
 * - code-quality → Dead Code Detector, Code Quality
 * - incident → Incident Diagnosis, Log Query Agent
 * - dependency → Dependency Upgrade Agent
 * - performance → Performance Profiler
 * - data-modeling → Data Model Lineage Mapper
 */
export const TAG_CATEGORIES: Array<{
  category: string;
  site: string;
  tags: string[];
}> = [
  // Testing patterns
  {
    category: 'testing',
    site: 'stackoverflow',
    tags: ['unit-testing', 'integration-testing', 'tdd', 'mocking'],
  },
  // SQL optimization
  {
    category: 'sql',
    site: 'stackoverflow',
    tags: ['sql', 'query-optimization', 'database-performance', 'indexing'],
  },
  // Architecture patterns
  {
    category: 'architecture',
    site: 'stackoverflow',
    tags: ['software-architecture', 'design-patterns', 'microservices', 'clean-architecture'],
  },
  // Code quality (from Code Review StackExchange)
  {
    category: 'code-quality',
    site: 'codereview',
    tags: ['performance', 'object-oriented', 'design-patterns'],
  },
  // Incident / observability patterns
  {
    category: 'incident',
    site: 'stackoverflow',
    tags: ['logging', 'error-handling', 'monitoring', 'observability'],
  },
  // Dependency management
  {
    category: 'dependency',
    site: 'stackoverflow',
    tags: ['npm', 'dependency-management', 'semantic-versioning', 'package-management'],
  },
  // Performance profiling
  {
    category: 'performance',
    site: 'stackoverflow',
    tags: ['performance', 'profiling', 'memory-leaks', 'optimization'],
  },
  // Data modeling
  {
    category: 'data-modeling',
    site: 'stackoverflow',
    tags: ['database-design', 'data-modeling', 'entity-relationship', 'normalization'],
  },
];

// ============================================================================
// FETCHER FUNCTIONS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSEAPI<T>(
  endpoint: string,
  params: Record<string, string>,
  apiKey?: string,
): Promise<{ items: T[]; has_more: boolean; quota_remaining: number }> {
  const searchParams = new URLSearchParams(params);
  if (apiKey) searchParams.set('key', apiKey);
  const url = `${SE_API_BASE}${endpoint}?${searchParams.toString()}`;

  const response = await fetch(url, {
    headers: {
      'Accept-Encoding': 'gzip',
      'User-Agent': 'NexusBrain-StackExchangeTrainer/1.0',
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      console.log(`[StackExchangeFetcher] Rate limited, waiting 30s...`);
      await sleep(30000);
      return fetchSEAPI(endpoint, params, apiKey);
    }
    throw new Error(`SE API ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

async function fetchQuestionsByTags(
  site: string,
  tags: string[],
  options: StackExchangeFetchOptions,
): Promise<SEQuestion[]> {
  const maxPages = options.maxPages || 3;
  const delay = options.rateLimitDelay || 200;
  const allQuestions: SEQuestion[] = [];

  // Fetch top questions for each tag individually (AND with multiple tags yields too few results)
  for (const tag of tags) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const result = await fetchSEAPI<SEQuestion>('/questions', {
          order: 'desc',
          sort: 'votes',
          tagged: tag,
          site,
          pagesize: '100',
          page: String(page),
        }, options.apiKey);

        allQuestions.push(...result.items);

        if (!result.has_more) break;
        if (result.quota_remaining < 20) {
          console.log(`[StackExchangeFetcher] Quota low (${result.quota_remaining}), stopping`);
          return allQuestions;
        }

        await sleep(delay);
      } catch (err) {
        console.log(`[StackExchangeFetcher] [${tag}] page ${page}: ${err instanceof Error ? err.message : String(err)}`);
        break;
      }
    }
    await sleep(delay);
  }

  // Deduplicate by question_id
  const seen = new Set<number>();
  return allQuestions.filter(q => {
    if (seen.has(q.question_id)) return false;
    seen.add(q.question_id);
    return true;
  });
}

async function fetchTopAnswerers(
  site: string,
  tag: string,
  options: StackExchangeFetchOptions,
): Promise<Array<{ user: string; reputation: number; score: number }>> {
  try {
    const result = await fetchSEAPI<{
      user: { display_name: string; reputation: number };
      score: number;
    }>(`/tags/${encodeURIComponent(tag)}/top-answerers/all_time`, {
      site,
      pagesize: '20',
    }, options.apiKey);

    return result.items.map(item => ({
      user: item.user.display_name,
      reputation: item.user.reputation,
      score: item.score,
    }));
  } catch {
    return [];
  }
}

async function fetchTagInfo(
  site: string,
  tags: string[],
  options: StackExchangeFetchOptions,
): Promise<SETagInfo[]> {
  try {
    const tagStr = tags.join(';');
    const result = await fetchSEAPI<SETagInfo>('/tags/' + encodeURIComponent(tagStr) + '/info', {
      site,
    }, options.apiKey);
    return result.items;
  } catch {
    return [];
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function fetchAllStackExchangeData(
  categories?: typeof TAG_CATEGORIES,
  options: StackExchangeFetchOptions = {},
): Promise<TagCategoryData[]> {
  const targets = categories || TAG_CATEGORIES;
  const delay = options.rateLimitDelay || 200;
  const results: TagCategoryData[] = [];

  console.log(`[StackExchangeFetcher] Fetching ${targets.length} tag categories from StackExchange...`);

  for (let i = 0; i < targets.length; i++) {
    const { category, site, tags } = targets[i];
    console.log(`[${i + 1}/${targets.length}] -- ${category} (${site}: ${tags.join(', ')}) --`);

    const questions = await fetchQuestionsByTags(site, tags, options);
    await sleep(delay);

    // Get top answerers for first tag in category
    const topAnswerers = await fetchTopAnswerers(site, tags[0], options);
    await sleep(delay);

    // Get tag info
    const tagInfo = await fetchTagInfo(site, tags, options);
    await sleep(delay);

    results.push({
      category,
      site,
      tags,
      questions,
      topAnswerers,
      tagInfo,
      fetchedAt: new Date(),
    });

    const answered = questions.filter(q => q.is_answered).length;
    const avgScore = questions.length > 0
      ? Math.round(questions.reduce((s, q) => s + q.score, 0) / questions.length)
      : 0;
    console.log(
      `[StackExchangeFetcher] [${category}] DONE: ${questions.length} questions ` +
      `(${answered} answered, avg score ${avgScore}, ${topAnswerers.length} top answerers)`,
    );
  }

  const totalQs = results.reduce((sum, r) => sum + r.questions.length, 0);
  console.log(`[StackExchangeFetcher] Complete: ${totalQs} questions across ${results.length} categories`);

  return results;
}
