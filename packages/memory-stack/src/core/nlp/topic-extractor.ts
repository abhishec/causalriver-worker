/**
 * Topic Extractor — Zero-dependency
 *
 * TF-IDF based keyword and phrase extraction with:
 * - Term frequency calculation
 * - Inverse document frequency (corpus-aware when stats provided)
 * - Multi-word phrase extraction (bigrams, trigrams)
 * - Stop word filtering
 * - Domain inference (maps topics to NexusBrain domains)
 *
 * Used by connectors to tag signals with topics.
 * Feeds the expertise graph: contributor → topics they discuss.
 * Enables "what topics are trending?" queries.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ExtractedTopics {
  /** Ranked keywords by TF-IDF score */
  keywords: Array<{ word: string; score: number }>;
  /** Ranked multi-word phrases */
  phrases: Array<{ phrase: string; score: number }>;
  /** Inferred NexusBrain domains from extracted topics */
  domains: string[];
}

export interface CorpusStats {
  /** How many documents contain each term */
  documentFrequency: Map<string, number>;
  /** Total number of documents in corpus */
  totalDocuments: number;
}

export interface TopicExtractorConfig {
  /** Maximum keywords to return (default: 10) */
  maxKeywords?: number;
  /** Maximum phrases to return (default: 5) */
  maxPhrases?: number;
  /** Minimum word length for keywords (default: 3) */
  minWordLength?: number;
}

// =============================================================================
// STOP WORDS
// =============================================================================

const STOP_WORDS = new Set([
  // Common English stop words
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my',
  'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'their',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'because', 'if', 'then', 'else', 'while',
  'about', 'up', 'out', 'off', 'over', 'under', 'again', 'further',
  'once', 'here', 'there', 'also', 'still', 'already', 'now',
  'get', 'got', 'getting', 'make', 'made', 'making', 'let', 'go',
  'going', 'gone', 'went', 'come', 'came', 'take', 'took', 'taken',
  'see', 'saw', 'seen', 'know', 'knew', 'known', 'think', 'thought',
  'say', 'said', 'tell', 'told', 'give', 'gave', 'given',
  'use', 'used', 'using', 'look', 'looking', 'want', 'wanted',
  'like', 'liked', 'thing', 'things', 'way', 'ways',
  // Common chat/code words that aren't topical
  'yeah', 'yes', 'yep', 'nope', 'hey', 'hi', 'hello', 'thanks',
  'thank', 'please', 'lol', 'btw', 'fyi', 'imo', 'imho',
  'http', 'https', 'www', 'com', 'org', 'io',
]);

// =============================================================================
// DOMAIN INFERENCE
// =============================================================================

/**
 * Maps keywords to NexusBrain domains.
 * Follows the pattern from knowledge-graph-builder.ts inferDomain().
 */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  engineering: [
    'code', 'deploy', 'deployment', 'ci', 'cd', 'pipeline', 'build', 'test', 'testing',
    'pr', 'pull', 'request', 'merge', 'commit', 'branch', 'git', 'github', 'repository',
    'bug', 'fix', 'refactor', 'architecture', 'api', 'endpoint', 'database', 'migration',
    'docker', 'kubernetes', 'aws', 'infrastructure', 'devops', 'sre', 'incident',
    'outage', 'downtime', 'mttr', 'uptime', 'monitoring', 'alerting', 'rollback',
    'typescript', 'javascript', 'python', 'rust', 'react', 'node', 'postgres', 'redis',
    'microservice', 'service', 'server', 'client', 'frontend', 'backend',
    'sprint', 'velocity', 'jira', 'linear', 'ticket', 'backlog',
  ],
  finance: [
    'revenue', 'invoice', 'payment', 'billing', 'cash', 'budget', 'expense', 'cost',
    'mrr', 'arr', 'dso', 'margin', 'profit', 'financial', 'fiscal', 'accounting',
  ],
  cs: [
    'churn', 'retention', 'nps', 'csat', 'health', 'onboarding', 'adoption',
    'customer', 'support', 'ticket', 'escalation', 'satisfaction',
  ],
  revenue: [
    'deal', 'pipeline', 'quota', 'sales', 'prospect', 'lead', 'conversion',
    'win', 'loss', 'forecast', 'opportunity',
  ],
  product: [
    'feature', 'roadmap', 'release', 'launch', 'adoption', 'usage', 'feedback',
    'beta', 'ux', 'design', 'prototype',
  ],
  marketing: [
    'campaign', 'mql', 'sql', 'cac', 'seo', 'content', 'brand', 'awareness',
    'advertising', 'email', 'newsletter',
  ],
  people: [
    'hiring', 'attrition', 'employee', 'team', 'culture', 'engagement',
    'performance', 'compensation', 'onboarding',
  ],
};

function inferDomains(keywords: string[]): string[] {
  const domainScores: Record<string, number> = {};
  const lowerKeywords = keywords.map(k => k.toLowerCase());

  for (const [domain, domainWords] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    for (const keyword of lowerKeywords) {
      if (domainWords.includes(keyword)) {
        score++;
      }
    }
    if (score > 0) {
      domainScores[domain] = score;
    }
  }

  return Object.entries(domainScores)
    .sort((a, b) => b[1] - a[1])
    .map(([domain]) => domain);
}

// =============================================================================
// TOKENIZER
// =============================================================================

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

function isValidKeyword(word: string, minLength: number): boolean {
  if (word.length < minLength) return false;
  if (STOP_WORDS.has(word)) return false;
  if (/^\d+$/.test(word)) return false; // Pure numbers
  return true;
}

// =============================================================================
// TF-IDF
// =============================================================================

function computeTF(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  // Normalize by total tokens
  const total = tokens.length;
  for (const [term, count] of freq) {
    freq.set(term, count / total);
  }
  return freq;
}

function computeIDF(term: string, corpusStats?: CorpusStats): number {
  if (!corpusStats || corpusStats.totalDocuments === 0) {
    return 1; // No corpus → assume equal importance
  }
  const df = corpusStats.documentFrequency.get(term) || 0;
  if (df === 0) {
    return Math.log(corpusStats.totalDocuments + 1); // Unknown term → high IDF
  }
  return Math.log(corpusStats.totalDocuments / df);
}

// =============================================================================
// PHRASE EXTRACTION
// =============================================================================

function extractPhrases(tokens: string[], minLength: number): Map<string, number> {
  const phrases = new Map<string, number>();

  // Bigrams
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (isValidKeyword(a, minLength) && isValidKeyword(b, minLength)) {
      const phrase = `${a} ${b}`;
      phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    }
  }

  // Trigrams
  for (let i = 0; i < tokens.length - 2; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    const c = tokens[i + 2];
    if (isValidKeyword(a, minLength) && isValidKeyword(c, minLength)) {
      // Middle word can be a stop word (e.g., "time to deploy")
      const phrase = `${a} ${b} ${c}`;
      phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    }
  }

  return phrases;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Extract topics (keywords and phrases) from text using TF-IDF scoring.
 *
 * @param text - Input text to extract topics from
 * @param corpusStats - Optional corpus statistics for IDF calculation
 * @param config - Optional configuration
 * @returns ExtractedTopics with ranked keywords, phrases, and inferred domains
 */
export function extractTopics(
  text: string,
  corpusStats?: CorpusStats,
  config?: TopicExtractorConfig
): ExtractedTopics {
  const maxKeywords = config?.maxKeywords ?? 10;
  const maxPhrases = config?.maxPhrases ?? 5;
  const minWordLength = config?.minWordLength ?? 3;

  if (!text || text.trim().length === 0) {
    return { keywords: [], phrases: [], domains: [] };
  }

  const tokens = tokenize(text);

  if (tokens.length === 0) {
    return { keywords: [], phrases: [], domains: [] };
  }

  // Compute TF for valid keywords
  const validTokens = tokens.filter(t => isValidKeyword(t, minWordLength));
  const tf = computeTF(validTokens);

  // Score keywords by TF-IDF
  const keywordScores: Array<{ word: string; score: number }> = [];
  for (const [term, tfScore] of tf) {
    const idf = computeIDF(term, corpusStats);
    keywordScores.push({ word: term, score: tfScore * idf });
  }
  keywordScores.sort((a, b) => b.score - a.score);

  // Extract and score phrases
  const phraseFreq = extractPhrases(tokens, minWordLength);
  const phraseScores: Array<{ phrase: string; score: number }> = [];
  for (const [phrase, count] of phraseFreq) {
    if (count >= 1) {
      // Score = frequency * average component IDF
      const words = phrase.split(' ').filter(w => isValidKeyword(w, minWordLength));
      const avgIdf = words.reduce((sum, w) => sum + computeIDF(w, corpusStats), 0) / Math.max(words.length, 1);
      const score = (count / tokens.length) * avgIdf * 1.5; // Boost phrases over single words
      phraseScores.push({ phrase, score });
    }
  }
  phraseScores.sort((a, b) => b.score - a.score);

  const topKeywords = keywordScores.slice(0, maxKeywords);
  const topPhrases = phraseScores.slice(0, maxPhrases);

  // Infer domains from keywords
  const allTopicWords = [
    ...topKeywords.map(k => k.word),
    ...topPhrases.flatMap(p => p.phrase.split(' ')),
  ];
  const domains = inferDomains(allTopicWords);

  return {
    keywords: topKeywords.map(k => ({
      word: k.word,
      score: Math.round(k.score * 1000) / 1000,
    })),
    phrases: topPhrases.map(p => ({
      phrase: p.phrase,
      score: Math.round(p.score * 1000) / 1000,
    })),
    domains,
  };
}

/**
 * Update corpus statistics with a new document.
 * Call this for each document to build IDF statistics over time.
 *
 * @param stats - Existing corpus stats (or create fresh with createCorpusStats())
 * @param text - New document text to add to corpus
 * @returns Updated corpus stats
 */
export function updateCorpusStats(stats: CorpusStats, text: string): CorpusStats {
  const tokens = new Set(tokenize(text));
  const newStats: CorpusStats = {
    documentFrequency: new Map(stats.documentFrequency),
    totalDocuments: stats.totalDocuments + 1,
  };

  for (const token of tokens) {
    newStats.documentFrequency.set(
      token,
      (newStats.documentFrequency.get(token) || 0) + 1
    );
  }

  return newStats;
}

/**
 * Create empty corpus stats for use with updateCorpusStats().
 */
export function createCorpusStats(): CorpusStats {
  return {
    documentFrequency: new Map(),
    totalDocuments: 0,
  };
}
