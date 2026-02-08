/**
 * Public Data Fetchers — Free API Sources for Brain Training
 *
 * Fetches data from 4 free public APIs:
 * - FRED (Federal Reserve Economic Data)
 * - GitHub API (public repo stats)
 * - World Bank Open Data
 * - Hacker News (tech sentiment proxy)
 *
 * Zero project dependencies — uses only built-in fetch().
 */

// ============================================================================
// TYPES
// ============================================================================

export interface FredObservation {
  date: string;
  value: string;
  realtime_start: string;
  realtime_end: string;
}

export interface FredSeriesResult {
  seriesId: string;
  title: string;
  observations: FredObservation[];
  fetchedAt: Date;
}

export interface GitHubRepoStats {
  owner: string;
  repo: string;
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  pushedAt: string;
  language: string;
  size: number;
  fetchedAt: Date;
}

export interface WorldBankIndicator {
  countryId: string;
  countryName: string;
  indicatorId: string;
  indicatorName: string;
  date: string;
  value: number | null;
}

export interface WorldBankResult {
  indicatorId: string;
  country: string;
  data: WorldBankIndicator[];
  fetchedAt: Date;
}

export interface HackerNewsStory {
  id: number;
  title: string;
  score: number;
  descendants: number;
  time: number;
  url?: string;
  type: string;
}

export interface HackerNewsSnapshot {
  topStoryIds: number[];
  stories: HackerNewsStory[];
  avgScore: number;
  avgComments: number;
  totalEngagement: number;
  fetchedAt: Date;
}

// ============================================================================
// DEFAULTS
// ============================================================================

export const DEFAULT_FRED_SERIES = [
  'GDP',        // Gross Domestic Product
  'UNRATE',     // Unemployment Rate
  'CPIAUCSL',   // Consumer Price Index (inflation)
  'FEDFUNDS',   // Federal Funds Rate
  'PAYEMS',     // Total Nonfarm Payrolls
  'UMCSENT',    // Consumer Sentiment
];

export const DEFAULT_GITHUB_REPOS = [
  { owner: 'facebook', repo: 'react' },
  { owner: 'vercel', repo: 'next.js' },
  { owner: 'microsoft', repo: 'TypeScript' },
  { owner: 'denoland', repo: 'deno' },
  { owner: 'supabase', repo: 'supabase' },
];

export const DEFAULT_WORLDBANK_INDICATORS = [
  'NY.GDP.MKTP.KD.ZG',  // GDP growth (annual %)
  'FP.CPI.TOTL.ZG',     // Inflation, consumer prices (annual %)
  'SL.UEM.TOTL.ZS',     // Unemployment (% of total labor force)
];

// ============================================================================
// SHARED HELPERS
// ============================================================================

/**
 * Safe fetch with timeout and retry
 */
async function safeFetch(
  url: string,
  options: RequestInit = {},
  retries = 1,
  timeoutMs = 15000
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (err: any) {
      if (attempt < retries) {
        console.log(`  Retry ${attempt + 1}/${retries} for ${url.substring(0, 80)}...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Unreachable');
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================================
// FRED API
// ============================================================================

const FRED_SERIES_TITLES: Record<string, string> = {
  GDP: 'Gross Domestic Product',
  UNRATE: 'Unemployment Rate',
  CPIAUCSL: 'Consumer Price Index',
  FEDFUNDS: 'Federal Funds Rate',
  PAYEMS: 'Total Nonfarm Payrolls',
  UMCSENT: 'Consumer Sentiment Index',
};

/**
 * Fetch FRED economic time series data
 *
 * @param seriesIds - FRED series IDs to fetch
 * @param apiKey - FRED API key (free registration or use DEMO_KEY)
 */
export async function fetchFredSeries(
  seriesIds: string[] = DEFAULT_FRED_SERIES,
  apiKey: string = 'DEMO_KEY'
): Promise<FredSeriesResult[]> {
  const results: FredSeriesResult[] = [];

  for (const seriesId of seriesIds) {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=60`;
      const response = await safeFetch(url);
      const data = await response.json();

      const observations: FredObservation[] = (data.observations || [])
        .filter((obs: any) => obs.value !== '.')
        .map((obs: any) => ({
          date: obs.date,
          value: obs.value,
          realtime_start: obs.realtime_start || '',
          realtime_end: obs.realtime_end || '',
        }));

      results.push({
        seriesId,
        title: FRED_SERIES_TITLES[seriesId] || seriesId,
        observations,
        fetchedAt: new Date(),
      });

      console.log(`  FRED ${seriesId}: ${observations.length} observations`);
    } catch (err: any) {
      console.warn(`  FRED ${seriesId} failed: ${err.message}`);
    }

    // Small delay between requests
    await sleep(300);
  }

  return results;
}

// ============================================================================
// GITHUB API
// ============================================================================

/**
 * Fetch GitHub repository statistics (unauthenticated: 60 req/hr)
 */
export async function fetchGitHubRepoStats(
  repos: Array<{ owner: string; repo: string }> = DEFAULT_GITHUB_REPOS
): Promise<GitHubRepoStats[]> {
  const results: GitHubRepoStats[] = [];

  for (const { owner, repo } of repos) {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}`;
      const response = await safeFetch(url, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      const data = await response.json();

      results.push({
        owner,
        repo,
        stars: data.stargazers_count || 0,
        forks: data.forks_count || 0,
        openIssues: data.open_issues_count || 0,
        watchers: data.watchers_count || 0,
        pushedAt: data.pushed_at || '',
        language: data.language || '',
        size: data.size || 0,
        fetchedAt: new Date(),
      });

      console.log(`  GitHub ${owner}/${repo}: ${data.stargazers_count} stars, ${data.open_issues_count} issues`);
    } catch (err: any) {
      console.warn(`  GitHub ${owner}/${repo} failed: ${err.message}`);
    }

    // Respect rate limits
    await sleep(1000);
  }

  return results;
}

// ============================================================================
// WORLD BANK API
// ============================================================================

/**
 * Fetch World Bank economic indicators
 */
export async function fetchWorldBankIndicators(
  country: string = 'US',
  indicatorIds: string[] = DEFAULT_WORLDBANK_INDICATORS
): Promise<WorldBankResult[]> {
  const results: WorldBankResult[] = [];

  for (const indicatorId of indicatorIds) {
    try {
      const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicatorId}?format=json&per_page=50`;
      const response = await safeFetch(url);
      const rawData = await response.json();

      // World Bank returns [metadata, data[]] array
      const entries = Array.isArray(rawData) && rawData.length > 1 ? rawData[1] : [];

      const data: WorldBankIndicator[] = (entries || [])
        .filter((entry: any) => entry.value !== null)
        .map((entry: any) => ({
          countryId: entry.country?.id || country,
          countryName: entry.country?.value || country,
          indicatorId: entry.indicator?.id || indicatorId,
          indicatorName: entry.indicator?.value || indicatorId,
          date: entry.date || '',
          value: entry.value,
        }));

      results.push({
        indicatorId,
        country,
        data,
        fetchedAt: new Date(),
      });

      console.log(`  World Bank ${indicatorId}: ${data.length} data points`);
    } catch (err: any) {
      console.warn(`  World Bank ${indicatorId} failed: ${err.message}`);
    }

    await sleep(500);
  }

  return results;
}

// ============================================================================
// HACKER NEWS API
// ============================================================================

/**
 * Fetch Hacker News top stories as tech sentiment proxy
 */
export async function fetchHackerNewsTop(
  count: number = 30
): Promise<HackerNewsSnapshot> {
  const fetchedAt = new Date();

  try {
    // Fetch top story IDs
    const topResponse = await safeFetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const topStoryIds: number[] = await topResponse.json();
    const storyIds = topStoryIds.slice(0, count);

    // Fetch individual stories (5 at a time to avoid overwhelming)
    const stories: HackerNewsStory[] = [];
    const batchSize = 5;

    for (let i = 0; i < storyIds.length; i += batchSize) {
      const batch = storyIds.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (id) => {
          const res = await safeFetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {}, 0, 10000);
          return res.json();
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          const item = result.value;
          stories.push({
            id: item.id,
            title: item.title || '',
            score: item.score || 0,
            descendants: item.descendants || 0,
            time: item.time || 0,
            url: item.url,
            type: item.type || 'story',
          });
        }
      }

      if (i + batchSize < storyIds.length) {
        await sleep(200);
      }
    }

    const totalScore = stories.reduce((sum, s) => sum + s.score, 0);
    const totalComments = stories.reduce((sum, s) => sum + s.descendants, 0);

    console.log(`  Hacker News: ${stories.length} stories, avg score ${Math.round(totalScore / (stories.length || 1))}`);

    return {
      topStoryIds: storyIds,
      stories,
      avgScore: stories.length > 0 ? totalScore / stories.length : 0,
      avgComments: stories.length > 0 ? totalComments / stories.length : 0,
      totalEngagement: totalScore + totalComments,
      fetchedAt,
    };
  } catch (err: any) {
    console.warn(`  Hacker News failed: ${err.message}`);
    return {
      topStoryIds: [],
      stories: [],
      avgScore: 0,
      avgComments: 0,
      totalEngagement: 0,
      fetchedAt,
    };
  }
}
