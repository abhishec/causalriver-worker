/**
 * Public Content Fetcher — Sensory Organs (Eyes, Ears, Touch)
 * ============================================================
 *
 * Brain Analog: Before the Sensory Cortex can process information, the
 * sensory organs must first CAPTURE raw input from the environment.
 * Eyes capture photons, ears capture sound waves, skin captures pressure.
 *
 * This module is the brain's sensory organs for TEXT content:
 * - Wikipedia articles → domain knowledge
 * - Economic reports → macro-economic understanding
 * - Tech news → industry trends
 * - Research abstracts → causal mechanisms
 *
 * While the existing `public-data-learner.ts` captures NUMERIC signals
 * (time series), this module captures TEXT content for LLM distillation.
 * Both feed the same brain — numbers go to causal discovery,
 * text goes to knowledge distillation.
 *
 * @packageDocumentation
 */

import type { RawContent } from './llm-knowledge-distiller';

// ============================================================================
// TYPES
// ============================================================================

/** Content fetcher configuration */
export interface ContentFetcherConfig {
  /** Which content sources to enable (default: all) */
  enabledSources?: string[];
  /** Maximum articles to fetch per source (default: 5) */
  maxPerSource?: number;
  /** Verbose logging */
  verbose?: boolean;
}

/** Result from a content fetch cycle */
export interface ContentFetchResult {
  /** All fetched content items */
  contents: RawContent[];
  /** Per-source stats */
  sources: Array<{
    name: string;
    itemsFetched: number;
    success: boolean;
    error?: string;
    durationMs: number;
  }>;
  /** Total fetch duration */
  totalDurationMs: number;
}

// ============================================================================
// WIKIPEDIA CONTENT TOPICS
// ============================================================================

/**
 * Curated Wikipedia articles organized by knowledge domain.
 *
 * Brain Analog: These are the "textbooks" the brain reads to build
 * foundational knowledge. A medical student reads anatomy textbooks;
 * NexusBrain reads Wikipedia articles about business, economics, and tech.
 */
const WIKIPEDIA_TOPICS: Record<string, string[]> = {
  // Economics & Finance
  economics: [
    'Supply_and_demand', 'Monetary_policy', 'Fiscal_policy',
    'Gross_domestic_product', 'Inflation', 'Interest_rate',
    'Business_cycle', 'Recession', 'Bear_market',
  ],
  // Technology & SaaS
  technology: [
    'Software_as_a_service', 'Cloud_computing', 'Artificial_intelligence',
    'Machine_learning', 'DevOps', 'Agile_software_development',
    'Customer_relationship_management', 'Data_analytics',
  ],
  // Business Operations
  business: [
    'Customer_churn', 'Net_promoter_score', 'Customer_lifetime_value',
    'Revenue_recognition', 'Unit_economics', 'Subscription_business_model',
    'Venture_capital', 'Initial_public_offering',
  ],
  // Human Resources & Organization
  people: [
    'Employee_retention', 'Employee_engagement', 'Organizational_culture',
    'Remote_work', 'Knowledge_management', 'Talent_management',
  ],
  // Marketing & Growth
  marketing: [
    'Growth_hacking', 'Customer_acquisition_cost',
    'Search_engine_optimization', 'Content_marketing',
    'Product-market_fit', 'Network_effect',
  ],
  // Causal Thinking
  causality: [
    'Causality', 'Granger_causality', 'Correlation_does_not_imply_causation',
    'Confounding', 'Randomized_controlled_trial', 'Bayesian_inference',
  ],
};

// ============================================================================
// PUBLIC CONTENT FETCHER
// ============================================================================

export function createPublicContentFetcher(config: ContentFetcherConfig = {}) {
  const {
    enabledSources = ['wikipedia', 'hackernews_articles'],
    maxPerSource = 5,
    verbose = false,
  } = config;

  function log(msg: string): void {
    if (verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [CONTENT] ${msg}`);
    }
  }

  async function fetchJson(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json();
  }

  async function fetchText(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.text();
  }

  // ── Source 1: Wikipedia Article Summaries ──────────────────────────

  /**
   * Fetch Wikipedia article extracts for LLM knowledge distillation.
   *
   * Brain Analog: Reading a textbook. The brain doesn't memorize every word;
   * it extracts the KEY RELATIONSHIPS and CAUSAL MECHANISMS described.
   */
  async function fetchWikipediaArticles(): Promise<RawContent[]> {
    const contents: RawContent[] = [];
    const now = new Date().toISOString();

    // Select a rotating subset of topics (different each day)
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    const allTopics = Object.entries(WIKIPEDIA_TOPICS);
    const todaysCategoryIdx = dayOfYear % allTopics.length;
    const [categoryName, topics] = allTopics[todaysCategoryIdx];

    // Also pick a few from other categories for cross-domain learning
    const crossCategoryIdx = (todaysCategoryIdx + 3) % allTopics.length;
    const crossTopics = allTopics[crossCategoryIdx][1].slice(0, 2);
    const selectedTopics = [...topics.slice(0, maxPerSource), ...crossTopics];

    log(`Wikipedia: fetching ${selectedTopics.length} articles from "${categoryName}" + cross-domain`);

    for (const title of selectedTopics) {
      try {
        // Use Wikipedia API to get article extract (first ~3000 chars)
        const data = await fetchJson(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
        );

        if (data.extract && data.extract.length > 100) {
          contents.push({
            id: `wikipedia_${title}_${dayOfYear}`,
            source: 'wikipedia',
            title: data.title || title.replace(/_/g, ' '),
            text: data.extract,
            fetchedAt: now,
            domainHint: categoryName,
          });
        }
      } catch (err) {
        // Non-critical: Wikipedia article fetch for single title — continue with next article
      }
    }

    return contents;
  }

  // ── Source 2: Hacker News Top Stories ──────────────────────────────

  /**
   * Fetch top Hacker News stories' titles and metadata for trend analysis.
   *
   * Brain Analog: Overhearing conversations in a crowded tech conference.
   * The brain picks up on what topics are "hot" and what the crowd cares about.
   */
  async function fetchHackerNewsArticles(): Promise<RawContent[]> {
    const contents: RawContent[] = [];
    const now = new Date().toISOString();

    try {
      const topIds = await fetchJson('https://hacker-news.firebaseio.com/v0/topstories.json');
      const top = (topIds || []).slice(0, maxPerSource);

      for (const id of top) {
        try {
          const story = await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          if (story && story.title) {
            // Build a text summary from the story metadata
            const text = [
              `Title: ${story.title}`,
              story.text ? `Content: ${story.text.replace(/<[^>]+>/g, ' ').slice(0, 2000)}` : '',
              `Score: ${story.score || 0} points, ${story.descendants || 0} comments`,
              story.url ? `Source URL: ${story.url}` : '',
            ].filter(Boolean).join('\n');

            contents.push({
              id: `hn_${story.id}`,
              source: 'hackernews',
              title: story.title,
              text,
              fetchedAt: now,
              domainHint: 'technology',
            });
          }
        } catch (err) {
          // Non-critical: Hacker News story fetch for single item — continue with next story
        }
      }
    } catch (err) {
      // Non-critical: Hacker News API call failure — entire source may be unavailable
    }

    return contents;
  }

  // ── Source 3: FRED Economic Commentary ─────────────────────────────

  /**
   * Fetch FRED release descriptions and economic context.
   *
   * Brain Analog: Reading the Federal Reserve's quarterly report.
   * Understanding WHY indicators moved, not just THAT they moved.
   */
  async function fetchFREDCommentary(): Promise<RawContent[]> {
    const contents: RawContent[] = [];
    const now = new Date().toISOString();

    // FRED releases with economic commentary
    const releases = [
      { id: '53', name: 'GDP and Personal Income' },
      { id: '50', name: 'Employment Situation' },
      { id: '46', name: 'Consumer Price Index' },
      { id: '10', name: 'Consumer Confidence' },
      { id: '15', name: 'Housing Starts' },
    ];

    for (const release of releases.slice(0, maxPerSource)) {
      try {
        const data = await fetchJson(
          `https://api.stlouisfed.org/fred/release?release_id=${release.id}&api_key=DEMO_KEY&file_type=json`
        );

        if (data.releases && data.releases.length > 0) {
          const rel = data.releases[0];
          const text = [
            `Economic Release: ${rel.name}`,
            rel.notes ? `Notes: ${rel.notes}` : '',
            `Press Release URL: ${rel.press_release || 'N/A'}`,
            `Last Updated: ${rel.realtime_end || 'N/A'}`,
          ].filter(Boolean).join('\n');

          if (text.length > 50) {
            contents.push({
              id: `fred_release_${release.id}`,
              source: 'fred',
              title: rel.name || release.name,
              text,
              fetchedAt: now,
              domainHint: 'macro_economy',
            });
          }
        }
      } catch (err) {
        // Non-critical: FRED release commentary fetch for single release — continue with next release
      }
    }

    return contents;
  }

  // ── Source 4: GitHub Repository READMEs ────────────────────────────

  /**
   * Fetch README content from trending repos for tech ecosystem signals.
   *
   * Brain Analog: Exploring a new lab/workshop. Reading the documentation
   * to understand what tools exist and how they relate to each other.
   */
  async function fetchGitHubReadmes(): Promise<RawContent[]> {
    const contents: RawContent[] = [];
    const now = new Date().toISOString();

    // Repos whose evolution signals tech trends
    const repos = [
      'anthropics/anthropic-sdk-python',
      'openai/openai-node',
      'supabase/supabase',
      'vercel/next.js',
      'langchain-ai/langchainjs',
    ];

    for (const repo of repos.slice(0, maxPerSource)) {
      try {
        const data = await fetchJson(`https://api.github.com/repos/${repo}/readme`);
        if (data.content) {
          // Base64 decode the README
          const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
          contents.push({
            id: `github_readme_${repo.replace('/', '_')}`,
            source: 'github',
            title: `${repo} README`,
            text: decoded.slice(0, 5000),
            fetchedAt: now,
            domainHint: 'technology',
          });
        }
      } catch (err) {
        // Non-critical: GitHub README fetch for single repo — may be rate limited or not found
      }
    }

    return contents;
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════

  return {
    /**
     * Fetch text content from all enabled public sources.
     * This content is ready to be fed to the LLM Knowledge Distiller.
     *
     * Brain Analog: Opening your eyes and ears — capturing raw environmental
     * input before the cortex processes it.
     */
    async fetch(): Promise<ContentFetchResult> {
      const overallStart = Date.now();
      const allContents: RawContent[] = [];
      const sourceResults: ContentFetchResult['sources'] = [];

      const fetchers: Record<string, () => Promise<RawContent[]>> = {
        wikipedia: fetchWikipediaArticles,
        hackernews_articles: fetchHackerNewsArticles,
        fred_commentary: fetchFREDCommentary,
        github_readmes: fetchGitHubReadmes,
      };

      for (const sourceName of enabledSources) {
        const fetcher = fetchers[sourceName];
        if (!fetcher) continue;

        const start = Date.now();
        try {
          const contents = await fetcher();
          allContents.push(...contents);
          sourceResults.push({
            name: sourceName,
            itemsFetched: contents.length,
            success: true,
            durationMs: Date.now() - start,
          });
          log(`${sourceName}: ${contents.length} items`);
        } catch (err: any) {
          sourceResults.push({
            name: sourceName,
            itemsFetched: 0,
            success: false,
            error: err.message,
            durationMs: Date.now() - start,
          });
          log(`${sourceName}: FAILED (${err.message})`);
        }
      }

      return {
        contents: allContents,
        sources: sourceResults,
        totalDurationMs: Date.now() - overallStart,
      };
    },

    /**
     * Get available content sources and their descriptions.
     */
    getAvailableSources(): Array<{ name: string; enabled: boolean; description: string }> {
      return [
        { name: 'wikipedia', enabled: enabledSources.includes('wikipedia'), description: 'Wikipedia article summaries — rotates through 50+ curated business/tech/economics topics daily' },
        { name: 'hackernews_articles', enabled: enabledSources.includes('hackernews_articles'), description: 'Hacker News top stories — tech sentiment and trending topics' },
        { name: 'fred_commentary', enabled: enabledSources.includes('fred_commentary'), description: 'FRED economic release notes — context behind economic indicators' },
        { name: 'github_readmes', enabled: enabledSources.includes('github_readmes'), description: 'GitHub README content — tech ecosystem signals from key repositories' },
      ];
    },

    /**
     * Get the Wikipedia topic categories and their articles.
     * Useful for understanding what knowledge domains are covered.
     */
    getTopicCategories(): Record<string, string[]> {
      return { ...WIKIPEDIA_TOPICS };
    },
  };
}
