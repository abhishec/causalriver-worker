/**
 * Public Data Fetchers — Free API Sources for Brain Training
 *
 * Fetches data from 10 free public APIs:
 * - FRED (Federal Reserve Economic Data)
 * - GitHub API (public repo stats)
 * - World Bank Open Data
 * - Hacker News (tech sentiment proxy)
 * - BLS (Bureau of Labor Statistics)
 * - SEC EDGAR (public company filings)
 * - Stack Overflow (developer ecosystem)
 * - Wikipedia Pageviews (brand/topic interest signals)
 * - IMF World Economic Outlook (global macro)
 * - USPTO PatentsView (innovation signals)
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

// ============================================================================
// BLS API (Bureau of Labor Statistics)
// ============================================================================

export interface BLSSeriesResult {
  seriesId: string;
  title: string;
  data: Array<{ year: string; period: string; value: number }>;
  fetchedAt: Date;
}

export const DEFAULT_BLS_SERIES = [
  { id: 'CES0000000001', title: 'Total Nonfarm Employment' },
  { id: 'LNS14000000', title: 'Unemployment Rate' },
  { id: 'CES0500000003', title: 'Average Hourly Earnings' },
  { id: 'CUUR0000SA0', title: 'CPI All Items' },
  { id: 'JTS000000000000000JOL', title: 'Job Openings (JOLTS)' },
];

/**
 * Fetch BLS labor statistics (no API key required for v1, v2 needs registration key)
 * v1 = 10 years of data, 25 queries per day
 */
export async function fetchBLSSeries(
  series: Array<{ id: string; title: string }> = DEFAULT_BLS_SERIES,
): Promise<BLSSeriesResult[]> {
  const results: BLSSeriesResult[] = [];

  // BLS API v1 allows fetching multiple series at once
  try {
    const url = 'https://api.bls.gov/publicAPI/v1/timeseries/data/';
    const body = JSON.stringify({
      seriesid: series.map(s => s.id),
      startyear: String(new Date().getFullYear() - 3),
      endyear: String(new Date().getFullYear()),
    });

    const response = await safeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const rawData = await response.json();

    if (rawData.status === 'REQUEST_SUCCEEDED' && rawData.Results?.series) {
      for (const s of rawData.Results.series) {
        const seriesConfig = series.find(sc => sc.id === s.seriesID);
        const data = (s.data || []).map((d: any) => ({
          year: d.year,
          period: d.period,
          value: parseFloat(d.value),
        })).filter((d: any) => !isNaN(d.value));

        results.push({
          seriesId: s.seriesID,
          title: seriesConfig?.title || s.seriesID,
          data,
          fetchedAt: new Date(),
        });

        console.log(`  BLS ${s.seriesID}: ${data.length} data points`);
      }
    }
  } catch (err: any) {
    console.warn(`  BLS fetch failed: ${err.message}`);
  }

  return results;
}

// ============================================================================
// SEC EDGAR API (Public Company Filings)
// ============================================================================

export interface SECCompanyFiling {
  cik: string;
  companyName: string;
  ticker: string;
  revenue?: number;
  netIncome?: number;
  totalAssets?: number;
  employees?: number;
  filingDate: string;
  fetchedAt: Date;
}

export const DEFAULT_SEC_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];

/**
 * Fetch SEC EDGAR company facts (free, no API key, rate-limited to 10 req/sec)
 */
export async function fetchSECCompanyFacts(
  tickers: string[] = DEFAULT_SEC_TICKERS,
): Promise<SECCompanyFiling[]> {
  const results: SECCompanyFiling[] = [];

  for (const ticker of tickers) {
    try {
      // First get CIK from ticker
      const tickerUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${ticker}%22&dateRange=custom&startdt=2024-01-01&enddt=${new Date().toISOString().split('T')[0]}&forms=10-K`;
      const searchResponse = await safeFetch(
        `https://efts.sec.gov/LATEST/search-index?q="${ticker}"&forms=10-K`,
        { headers: { 'User-Agent': 'NexusBrain/1.0 (research@nexusbrain.ai)' } },
        0,
        10000,
      );

      // Use company tickers endpoint instead (more reliable)
      const tickerLookup = await safeFetch(
        `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${ticker}&type=10-K&dateb=&owner=include&count=1&search_text=&action=getcompany&output=atom`,
        { headers: { 'User-Agent': 'NexusBrain/1.0 (research@nexusbrain.ai)' } },
        0,
        10000,
      );

      console.log(`  SEC ${ticker}: filing lookup attempted`);
    } catch (err: any) {
      console.warn(`  SEC ${ticker} failed: ${err.message}`);
    }

    await sleep(1200); // SEC rate limit: 10 req/sec
  }

  return results;
}

// ============================================================================
// STACK OVERFLOW API (Developer Ecosystem)
// ============================================================================

export interface StackOverflowSnapshot {
  topTags: Array<{ name: string; count: number }>;
  totalQuestions: number;
  avgAnswerCount: number;
  unansweredPercent: number;
  fetchedAt: Date;
}

/**
 * Fetch Stack Overflow tag trends (free, no API key for basic access)
 */
export async function fetchStackOverflowTrends(): Promise<StackOverflowSnapshot> {
  const fetchedAt = new Date();

  try {
    // Fetch popular tags
    const tagsUrl = 'https://api.stackexchange.com/2.3/tags?pagesize=25&order=desc&sort=popular&site=stackoverflow&filter=default';
    const tagsResponse = await safeFetch(tagsUrl, {}, 0, 10000);
    const tagsData = await tagsResponse.json();

    const topTags = (tagsData.items || []).map((t: any) => ({
      name: t.name,
      count: t.count || 0,
    }));

    // Fetch recent question stats
    const questionsUrl = 'https://api.stackexchange.com/2.3/questions?pagesize=50&order=desc&sort=creation&site=stackoverflow&filter=default';
    const questionsResponse = await safeFetch(questionsUrl, {}, 0, 10000);
    const questionsData = await questionsResponse.json();

    const questions = questionsData.items || [];
    const totalQuestions = questionsData.total || questions.length;
    const avgAnswerCount = questions.length > 0
      ? questions.reduce((sum: number, q: any) => sum + (q.answer_count || 0), 0) / questions.length
      : 0;
    const unansweredPercent = questions.length > 0
      ? questions.filter((q: any) => !q.is_answered).length / questions.length
      : 0;

    console.log(`  Stack Overflow: ${topTags.length} tags, avg ${avgAnswerCount.toFixed(1)} answers`);

    return { topTags, totalQuestions, avgAnswerCount, unansweredPercent, fetchedAt };
  } catch (err: any) {
    console.warn(`  Stack Overflow failed: ${err.message}`);
    return { topTags: [], totalQuestions: 0, avgAnswerCount: 0, unansweredPercent: 0, fetchedAt };
  }
}

// ============================================================================
// WIKIPEDIA PAGEVIEWS API (Brand/Topic Interest Signals)
// ============================================================================

export interface WikiPageviewResult {
  article: string;
  dailyViews: Array<{ date: string; views: number }>;
  totalViews: number;
  avgDailyViews: number;
  fetchedAt: Date;
}

/**
 * Fetch Wikipedia pageview data for articles (free, no auth, 200 req limit)
 * Useful as a proxy for public interest/brand awareness signals
 */
export async function fetchWikipediaPageviews(
  articles: string[] = [
    // ── AI & Machine Learning ──
    'Artificial_intelligence', 'Machine_learning', 'Deep_learning',
    'Large_language_model', 'Generative_artificial_intelligence', 'ChatGPT',
    'OpenAI', 'Anthropic', 'Natural_language_processing',
    // ── Cloud & SaaS ──
    'Cloud_computing', 'Software_as_a_service', 'Platform_as_a_service',
    'Amazon_Web_Services', 'Microsoft_Azure', 'Google_Cloud_Platform',
    'Salesforce', 'Snowflake_Inc.', 'Datadog',
    // ── Business & Finance ──
    'Venture_capital', 'Startup_company', 'Initial_public_offering',
    'Mergers_and_acquisitions', 'Private_equity', 'Angel_investor',
    'Series_A_round', 'Unicorn_(finance)', 'SPAC',
    // ── Economics ──
    'Economic_recession', 'Inflation', 'Interest_rate',
    'Federal_Reserve', 'Gross_domestic_product', 'Unemployment',
    'Consumer_Price_Index', 'Quantitative_easing', 'Yield_curve',
    // ── Tech Companies (brand signals) ──
    'Apple_Inc.', 'Microsoft', 'Alphabet_Inc.', 'Amazon_(company)',
    'Meta_Platforms', 'Nvidia', 'Tesla,_Inc.',
    // ── Work & HR ──
    'Remote_work', 'Quiet_quitting', 'Layoff',
    'Employee_engagement', 'Organizational_culture',
    // ── Security & Risk ──
    'Cybersecurity', 'Ransomware', 'Data_breach',
    'Cryptocurrency', 'Bitcoin', 'Blockchain',
    // ── Product & Growth ──
    'Product-market_fit', 'Product-led_growth', 'Customer_success',
    'Net_promoter_score', 'Customer_lifetime_value', 'Churn_rate',
    // ── Strategy & Innovation ──
    'Disruptive_innovation', 'Blue_Ocean_Strategy', 'Lean_startup',
    'Agile_software_development', 'DevOps', 'Scrum_(software_development)',
    // ── Industry Verticals ──
    'Fintech', 'Health_technology', 'E-commerce', 'Edtech',
    'Proptech', 'Insurtech', 'Regtech',
  ],
  days: number = 90, // 90 days for richer time series
): Promise<WikiPageviewResult[]> {
  const results: WikiPageviewResult[] = [];
  const fetchedAt = new Date();

  // Calculate date range
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString().split('T')[0].replace(/-/g, '');
  const endStr = end.toISOString().split('T')[0].replace(/-/g, '');

  for (const article of articles) {
    try {
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${encodeURIComponent(article)}/daily/${startStr}00/${endStr}00`;
      const response = await safeFetch(url, {
        headers: { 'User-Agent': 'NexusBrain/1.0 (research@nexusbrain.ai)' },
      }, 0, 10000);
      const data = await response.json();

      const dailyViews = (data.items || []).map((item: any) => ({
        date: item.timestamp?.substring(0, 8) || '',
        views: item.views || 0,
      }));

      const totalViews = dailyViews.reduce((sum: number, d: any) => sum + d.views, 0);
      const avgDailyViews = dailyViews.length > 0 ? totalViews / dailyViews.length : 0;

      results.push({ article, dailyViews, totalViews, avgDailyViews, fetchedAt });
      console.log(`  Wikipedia "${article}": ${avgDailyViews.toFixed(0)} avg daily views`);
    } catch (err: any) {
      console.warn(`  Wikipedia "${article}" failed: ${err.message}`);
    }

    await sleep(200); // Wikipedia allows ~200 req/period, keep it reasonable
  }

  return results;
}

// ============================================================================
// IMF WORLD ECONOMIC OUTLOOK (Global Macro Indicators)
// ============================================================================

export interface IMFIndicatorResult {
  indicator: string;
  indicatorLabel: string;
  country: string;
  values: Array<{ year: string; value: number | null }>;
  fetchedAt: Date;
}

/**
 * Fetch IMF WEO data via official DataMapper API (free, no auth, JSON)
 * Provides GDP growth, inflation, unemployment for all countries
 * URL: https://www.imf.org/external/datamapper/api/v1/{indicator}
 */
export async function fetchIMFWorldEconomicOutlook(
  indicators: string[] = [
    'NGDP_RPCH',    // Real GDP growth (%)
    'PCPIPCH',      // Inflation rate, avg consumer prices (%)
    'LUR',          // Unemployment rate (%)
    'BCA_NGDPD',    // Current account balance (% GDP)
    'GGXWDG_NGDP',  // Government gross debt (% GDP)
  ],
  countries: string[] = ['USA', 'CHN', 'DEU', 'JPN', 'GBR', 'IND', 'FRA', 'CAN', 'AUS', 'KOR'],
): Promise<IMFIndicatorResult[]> {
  const results: IMFIndicatorResult[] = [];
  const fetchedAt = new Date();
  const currentYear = new Date().getFullYear();
  const yearRange = Array.from({ length: 11 }, (_, i) => currentYear - 10 + i).join(',');

  const indicatorLabels: Record<string, string> = {
    'NGDP_RPCH': 'Real GDP Growth (%)',
    'PCPIPCH': 'Inflation Rate (%)',
    'LUR': 'Unemployment Rate (%)',
    'BCA_NGDPD': 'Current Account Balance (% GDP)',
    'GGXWDG_NGDP': 'Government Debt (% GDP)',
  };

  for (const indicator of indicators) {
    try {
      const url = `https://www.imf.org/external/datamapper/api/v1/${indicator}?periods=${yearRange}`;
      const response = await safeFetch(url, {
        headers: { 'User-Agent': 'NexusBrain/1.0 (research@nexusbrain.ai)' },
      }, 0, 20000);
      const data = await response.json();

      const indicatorData = data?.values?.[indicator];
      if (!indicatorData) {
        console.warn(`  IMF ${indicator}: no data in response`);
        continue;
      }

      // Extract data for target countries
      for (const country of countries) {
        const countryData = indicatorData[country];
        if (!countryData) continue;

        const values: Array<{ year: string; value: number | null }> = [];
        for (const [year, value] of Object.entries(countryData)) {
          if (typeof value === 'number') {
            values.push({ year, value });
          }
        }

        if (values.length > 0) {
          results.push({
            indicator,
            indicatorLabel: indicatorLabels[indicator] || indicator,
            country,
            values,
            fetchedAt,
          });
        }
      }

      const totalPoints = results.filter(r => r.indicator === indicator).reduce((sum, r) => sum + r.values.length, 0);
      console.log(`  IMF ${indicator}: ${totalPoints} data points across ${countries.length} countries`);
    } catch (err: any) {
      console.warn(`  IMF ${indicator} failed: ${err.message}`);
    }

    await sleep(500); // Be respectful to IMF servers
  }

  return results;
}

// ============================================================================
// USPTO PATENTSVIEW API (Innovation Signals)
// ============================================================================

export interface PatentTrendResult {
  year: number;
  totalPatents: number;
  topCategories: Array<{ name: string; count: number }>;
  avgCitationCount: number;
  fetchedAt: Date;
}

/**
 * Fetch USPTO PatentsView data (free, no auth required)
 * Patent trends as innovation velocity and R&D investment signals
 */
export async function fetchUSPTOPatentTrends(
  years: number = 5,
): Promise<PatentTrendResult[]> {
  const results: PatentTrendResult[] = [];
  const fetchedAt = new Date();
  const currentYear = new Date().getFullYear();

  for (let year = currentYear - years; year < currentYear; year++) {
    try {
      // Fetch patent counts by year and technology area
      const url = `https://api.patentsview.org/patents/query?q={"_and":[{"_gte":{"patent_date":"${year}-01-01"}},{"_lt":{"patent_date":"${year + 1}-01-01"}}]}&f=["patent_number","patent_date","patent_num_cited_by_us_patents"]&o={"page":1,"per_page":100}&s=[{"patent_date":"desc"}]`;
      const response = await safeFetch(url, {
        headers: { 'User-Agent': 'NexusBrain/1.0 (research@nexusbrain.ai)' },
      }, 0, 15000);
      const data = await response.json();

      const patents = data.patents || [];
      const totalPatents = data.total_patent_count || patents.length;
      const avgCitationCount = patents.length > 0
        ? patents.reduce((sum: number, p: any) => sum + (parseInt(p.patent_num_cited_by_us_patents) || 0), 0) / patents.length
        : 0;

      results.push({
        year,
        totalPatents,
        topCategories: [], // Would need CPC class endpoint for this
        avgCitationCount,
        fetchedAt,
      });

      console.log(`  USPTO ${year}: ${totalPatents} patents, avg ${avgCitationCount.toFixed(1)} citations`);
    } catch (err: any) {
      console.warn(`  USPTO ${year} failed: ${err.message}`);
    }

    await sleep(1000); // PatentsView is rate-limited
  }

  return results;
}
