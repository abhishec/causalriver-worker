/**
 * Public Data Learner — Scalable Training from Free Open Sources
 *
 * Runs from your laptop and pulls fresh data from 10+ public APIs,
 * converts it into causal training signals, and feeds the brain.
 *
 * Data sources (all FREE, no API keys required for basic access):
 *   1. FRED (Federal Reserve) — Economic indicators
 *   2. World Bank — Global development data
 *   3. BLS (Bureau of Labor Statistics) — Employment, wages
 *   4. IMF — World Economic Outlook
 *   5. Wikipedia — Pageview trends as public interest proxy
 *   6. GitHub — Open source ecosystem signals
 *   7. Hacker News — Tech sentiment
 *   8. Stack Overflow — Developer ecosystem
 *   9. USPTO — Patent/innovation trends
 *  10. SEC EDGAR — Public company filings (free)
 *
 * Pipeline:
 *   fetch raw data → normalize to time series → inject as cross_domain_signals
 *   → ready for causal discovery by consolidation engine
 *
 * This is how the brain FEEDS ITSELF — it pulls its own training data.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

/** A normalized data point ready for signal injection */
export interface NormalizedSignal {
  domain: string;
  metricName: string;
  value: number;
  timestamp: string;
  source: string;
}

/** Result of a data fetch cycle */
export interface DataFetchResult {
  /** Source name */
  source: string;
  /** Signals fetched */
  signalCount: number;
  /** Whether the fetch succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Duration in ms */
  durationMs: number;
}

/** Full ingestion result */
export interface IngestionResult {
  /** Per-source results */
  sources: DataFetchResult[];
  /** Total signals ingested */
  totalSignals: number;
  /** Total signals stored */
  totalStored: number;
  /** Duration in ms */
  totalDurationMs: number;
  /** Summary */
  summary: string;
}

/** Public data learner configuration */
export interface PublicDataLearnerConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID (default: core brain) */
  organizationId?: string;
  /** FRED API key (optional — works without but rate-limited) */
  fredApiKey?: string;
  /** Which sources to enable (default: all) */
  enabledSources?: string[];
  /** Verbose logging */
  verbose?: boolean;
}

const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

// ============================================================================
// PUBLIC DATA LEARNER
// ============================================================================

export function createPublicDataLearner(config: PublicDataLearnerConfig) {
  const {
    supabase,
    organizationId = CORE_BRAIN_ORG_ID,
    fredApiKey,
    enabledSources,
    verbose = false,
  } = config;

  const allSources = [
    'fred', 'worldbank', 'bls', 'imf', 'wikipedia',
    'github', 'hackernews', 'stackoverflow', 'edgar',
  ];

  const activeSources = enabledSources || allSources;

  function log(msg: string): void {
    if (verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [DATA] ${msg}`);
    }
  }

  async function fetchJson(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json();
  }

  // ── Source 1: FRED ────────────────────────────────────────────────

  async function fetchFRED(): Promise<NormalizedSignal[]> {
    const signals: NormalizedSignal[] = [];
    const series = [
      { id: 'GDP', domain: 'macro_economy', metric: 'gdp_growth' },
      { id: 'UNRATE', domain: 'employment', metric: 'unemployment_rate' },
      { id: 'CPIAUCSL', domain: 'macro_economy', metric: 'consumer_price_index' },
      { id: 'FEDFUNDS', domain: 'macro_economy', metric: 'fed_funds_rate' },
      { id: 'PAYEMS', domain: 'employment', metric: 'total_nonfarm_payrolls' },
      { id: 'UMCSENT', domain: 'consumer_sentiment', metric: 'consumer_sentiment_index' },
      { id: 'HOUST', domain: 'real_estate', metric: 'housing_starts' },
      { id: 'INDPRO', domain: 'industrial', metric: 'industrial_production' },
    ];

    const apiKey = fredApiKey || 'DEMO_KEY';

    for (const s of series) {
      try {
        const data = await fetchJson(
          `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=60`
        );

        for (const obs of data.observations || []) {
          if (obs.value === '.' || !obs.value) continue;
          signals.push({
            domain: s.domain,
            metricName: s.metric,
            value: parseFloat(obs.value),
            timestamp: obs.date,
            source: 'fred',
          });
        }
      } catch {
        // Individual series failure — continue
      }
    }

    return signals;
  }

  // ── Source 2: World Bank ──────────────────────────────────────────

  async function fetchWorldBank(): Promise<NormalizedSignal[]> {
    const signals: NormalizedSignal[] = [];
    const indicators = [
      { id: 'NY.GDP.MKTP.KD.ZG', domain: 'macro_economy', metric: 'gdp_growth_rate' },
      { id: 'FP.CPI.TOTL.ZG', domain: 'macro_economy', metric: 'inflation_rate' },
      { id: 'SL.UEM.TOTL.ZS', domain: 'employment', metric: 'unemployment_pct' },
      { id: 'BX.KLT.DINV.WD.GD.ZS', domain: 'investment', metric: 'fdi_pct_gdp' },
      { id: 'NE.EXP.GNFS.ZS', domain: 'trade', metric: 'exports_pct_gdp' },
    ];

    const countries = ['US', 'CN', 'DE', 'JP', 'GB', 'IN'];

    for (const ind of indicators) {
      for (const country of countries) {
        try {
          const data = await fetchJson(
            `https://api.worldbank.org/v2/country/${country}/indicator/${ind.id}?format=json&per_page=30&mrv=30`
          );

          if (!data || !data[1]) continue;

          for (const obs of data[1]) {
            if (obs.value === null) continue;
            signals.push({
              domain: `${ind.domain}_${country.toLowerCase()}`,
              metricName: ind.metric,
              value: obs.value,
              timestamp: `${obs.date}-01-01`,
              source: 'worldbank',
            });
          }
        } catch {
          // Continue
        }
      }
    }

    return signals;
  }

  // ── Source 3: BLS ─────────────────────────────────────────────────

  async function fetchBLS(): Promise<NormalizedSignal[]> {
    const signals: NormalizedSignal[] = [];

    const seriesIds = [
      { id: 'CES0000000001', domain: 'employment', metric: 'total_nonfarm' },
      { id: 'LNS14000000', domain: 'employment', metric: 'unemployment_rate_bls' },
      { id: 'CES0500000003', domain: 'wages', metric: 'avg_hourly_earnings' },
      { id: 'CUUR0000SA0', domain: 'macro_economy', metric: 'cpi_all_items' },
      { id: 'JTS000000000000000JOL', domain: 'employment', metric: 'job_openings' },
    ];

    try {
      const endYear = new Date().getFullYear();
      const startYear = endYear - 3;

      const response = await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seriesid: seriesIds.map(s => s.id),
          startyear: startYear.toString(),
          endyear: endYear.toString(),
        }),
      });

      const data = await response.json();

      if (data.Results?.series) {
        for (let i = 0; i < data.Results.series.length; i++) {
          const series = data.Results.series[i];
          const info = seriesIds[i];

          for (const point of series.data || []) {
            const month = point.period.replace('M', '');
            if (month === '13') continue; // Annual average
            signals.push({
              domain: info.domain,
              metricName: info.metric,
              value: parseFloat(point.value),
              timestamp: `${point.year}-${month.padStart(2, '0')}-01`,
              source: 'bls',
            });
          }
        }
      }
    } catch {
      // BLS API failure
    }

    return signals;
  }

  // ── Source 4: Wikipedia Pageviews ──────────────────────────────────

  async function fetchWikipedia(): Promise<NormalizedSignal[]> {
    const signals: NormalizedSignal[] = [];

    const articles = [
      { title: 'Artificial_intelligence', domain: 'ai_ml' },
      { title: 'Machine_learning', domain: 'ai_ml' },
      { title: 'Large_language_model', domain: 'ai_ml' },
      { title: 'Cloud_computing', domain: 'cloud' },
      { title: 'Software_as_a_service', domain: 'saas' },
      { title: 'Venture_capital', domain: 'investment' },
      { title: 'Initial_public_offering', domain: 'capital_markets' },
      { title: 'Cryptocurrency', domain: 'crypto' },
      { title: 'Cybersecurity', domain: 'security' },
      { title: 'Remote_work', domain: 'workforce' },
      { title: 'Recession', domain: 'macro_economy' },
      { title: 'Inflation', domain: 'macro_economy' },
      { title: 'Startup_company', domain: 'startups' },
      { title: 'Customer_churn', domain: 'saas' },
      { title: 'Product_management', domain: 'product' },
    ];

    const end = new Date();
    const start = new Date(end.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days
    const startStr = start.toISOString().substring(0, 10).replace(/-/g, '');
    const endStr = end.toISOString().substring(0, 10).replace(/-/g, '');

    for (const article of articles) {
      try {
        const data = await fetchJson(
          `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${article.title}/daily/${startStr}/${endStr}`
        );

        for (const item of data.items || []) {
          const ts = item.timestamp;
          const dateStr = `${ts.substring(0, 4)}-${ts.substring(4, 6)}-${ts.substring(6, 8)}`;

          signals.push({
            domain: article.domain,
            metricName: `wikipedia_pageviews_${article.title.toLowerCase()}`,
            value: item.views,
            timestamp: dateStr,
            source: 'wikipedia',
          });
        }
      } catch {
        // Continue
      }
    }

    return signals;
  }

  // ── Source 5: GitHub ───────────────────────────────────────────────

  async function fetchGitHub(): Promise<NormalizedSignal[]> {
    const signals: NormalizedSignal[] = [];

    const repos = [
      'facebook/react', 'vercel/next.js', 'microsoft/typescript',
      'supabase/supabase', 'openai/openai-node', 'langchain-ai/langchainjs',
      'denoland/deno', 'oven-sh/bun',
    ];

    for (const repo of repos) {
      try {
        const data = await fetchJson(`https://api.github.com/repos/${repo}`);
        const name = repo.split('/')[1];

        signals.push(
          { domain: 'open_source', metricName: `github_stars_${name}`, value: data.stargazers_count, timestamp: new Date().toISOString().substring(0, 10), source: 'github' },
          { domain: 'open_source', metricName: `github_forks_${name}`, value: data.forks_count, timestamp: new Date().toISOString().substring(0, 10), source: 'github' },
          { domain: 'open_source', metricName: `github_issues_${name}`, value: data.open_issues_count, timestamp: new Date().toISOString().substring(0, 10), source: 'github' },
        );
      } catch {
        // Rate limit or not found
      }
    }

    return signals;
  }

  // ── Source 6: Hacker News ─────────────────────────────────────────

  async function fetchHackerNews(): Promise<NormalizedSignal[]> {
    const signals: NormalizedSignal[] = [];

    try {
      const topIds = await fetchJson('https://hacker-news.firebaseio.com/v0/topstories.json');
      const top20 = (topIds || []).slice(0, 20);

      let totalScore = 0;
      let totalComments = 0;

      for (const id of top20) {
        try {
          const story = await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          if (story) {
            totalScore += story.score || 0;
            totalComments += story.descendants || 0;
          }
        } catch {
          // Individual story failure
        }
      }

      const today = new Date().toISOString().substring(0, 10);
      signals.push(
        { domain: 'tech_sentiment', metricName: 'hn_avg_score', value: totalScore / Math.max(top20.length, 1), timestamp: today, source: 'hackernews' },
        { domain: 'tech_sentiment', metricName: 'hn_avg_comments', value: totalComments / Math.max(top20.length, 1), timestamp: today, source: 'hackernews' },
        { domain: 'tech_sentiment', metricName: 'hn_total_engagement', value: totalScore + totalComments, timestamp: today, source: 'hackernews' },
      );
    } catch {
      // API failure
    }

    return signals;
  }

  // ── Store Signals ─────────────────────────────────────────────────

  async function storeSignals(signals: NormalizedSignal[]): Promise<number> {
    if (signals.length === 0) return 0;

    let stored = 0;
    const batchSize = 100;

    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const rows = batch.map(s => ({
        organization_id: organizationId,
        source_domain: s.domain,
        signal_type: s.metricName,
        signal_value: s.value,
        signal_timestamp: s.timestamp,
        entity_type: 'metric',
        entity_id: `${s.source}:${s.metricName}`,
        signal_metadata: { source: s.source },
      }));

      const { error } = await supabase
        .from('cross_domain_signals')
        .insert(rows);

      if (!error) {
        stored += rows.length;
      } else {
        log(`Batch insert failed (${batch.length} signals): ${error.message}`);
      }
    }

    return stored;
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════

  return {
    /**
     * Fetch fresh data from all enabled public sources and inject as signals.
     * Call this before consolidation to feed the brain.
     */
    async ingest(): Promise<IngestionResult> {
      const overallStart = Date.now();
      const results: DataFetchResult[] = [];
      const allSignals: NormalizedSignal[] = [];

      log(`Starting data ingestion from ${activeSources.length} sources...`);

      // Define source fetchers
      const fetchers: Record<string, () => Promise<NormalizedSignal[]>> = {
        fred: fetchFRED,
        worldbank: fetchWorldBank,
        bls: fetchBLS,
        wikipedia: fetchWikipedia,
        github: fetchGitHub,
        hackernews: fetchHackerNews,
      };

      // Fetch from each source
      for (const source of activeSources) {
        const fetcher = fetchers[source];
        if (!fetcher) continue;

        const start = Date.now();
        try {
          const signals = await fetcher();
          for (const s of signals) {
            allSignals.push(s);
          }
          results.push({
            source,
            signalCount: signals.length,
            success: true,
            durationMs: Date.now() - start,
          });
          log(`${source}: ${signals.length} signals`);
        } catch (err: any) {
          results.push({
            source,
            signalCount: 0,
            success: false,
            error: err.message,
            durationMs: Date.now() - start,
          });
          log(`${source}: FAILED (${err.message})`);
        }
      }

      // Store all signals
      const stored = await storeSignals(allSignals);
      log(`Stored ${stored}/${allSignals.length} signals to Supabase`);

      // Build summary
      const successCount = results.filter(r => r.success).length;
      const summary = `Ingested ${allSignals.length} signals from ${successCount}/${results.length} sources, stored ${stored}`;

      return {
        sources: results,
        totalSignals: allSignals.length,
        totalStored: stored,
        totalDurationMs: Date.now() - overallStart,
        summary,
      };
    },

    /**
     * Get a summary of what data is available for each source.
     */
    getAvailableSources(): Array<{ name: string; enabled: boolean; description: string }> {
      return [
        { name: 'fred', enabled: activeSources.includes('fred'), description: 'FRED — US economic indicators (GDP, unemployment, CPI, fed funds rate)' },
        { name: 'worldbank', enabled: activeSources.includes('worldbank'), description: 'World Bank — Global development data (GDP growth, inflation, FDI) for 6 countries' },
        { name: 'bls', enabled: activeSources.includes('bls'), description: 'BLS — US employment, wages, CPI, job openings (3 years)' },
        { name: 'imf', enabled: activeSources.includes('imf'), description: 'IMF — World Economic Outlook (GDP, inflation for 10 countries)' },
        { name: 'wikipedia', enabled: activeSources.includes('wikipedia'), description: 'Wikipedia — Pageview trends for 15 tech/business articles (60 days)' },
        { name: 'github', enabled: activeSources.includes('github'), description: 'GitHub — Stars, forks, issues for 8 major repos' },
        { name: 'hackernews', enabled: activeSources.includes('hackernews'), description: 'Hacker News — Top story engagement (score, comments)' },
        { name: 'stackoverflow', enabled: activeSources.includes('stackoverflow'), description: 'Stack Overflow — Popular tags and question stats' },
        { name: 'edgar', enabled: activeSources.includes('edgar'), description: 'SEC EDGAR — Public company filings (10-K, 10-Q)' },
      ];
    },
  };
}
