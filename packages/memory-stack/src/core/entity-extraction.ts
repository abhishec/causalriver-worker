/**
 * Entity Extraction — Regex + AI-Based Entity Recognition
 *
 * Extracts structured entities from unstructured text:
 *   - People, companies, products
 *   - Dates, amounts, percentages
 *   - Technologies, metrics
 *   - Emails, URLs, @mentions
 *
 * Two modes:
 *   1. Fast regex extraction (zero API calls)
 *   2. AI-powered extraction via Claude (structured JSON output)
 *
 * Works across ALL domains: finance ("$50K ARR"), engineering ("React v18"),
 * support ("CSAT 85%"), HR ("3 new hires"), marketing ("MQL conversion 12%").
 *
 * @example
 * ```typescript
 * const extractor = createEntityExtractor();
 * const entities = extractor.extractFromText('Acme Corp paid $50K on Jan 15, 2025');
 * // [
 * //   { text: 'Acme Corp', type: 'company', confidence: 0.8 },
 * //   { text: '$50K', type: 'amount', confidence: 0.95, normalizedValue: 50000 },
 * //   { text: 'Jan 15, 2025', type: 'date', confidence: 0.95 },
 * // ]
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedEntity {
  /** The raw text that was matched */
  text: string;
  /** Entity type */
  type:
    | 'person'
    | 'company'
    | 'product'
    | 'date'
    | 'amount'
    | 'percentage'
    | 'technology'
    | 'metric'
    | 'email'
    | 'url'
    | 'mention';
  /** Confidence score (0-1) */
  confidence: number;
  /** Start offset in the original text */
  startOffset: number;
  /** End offset in the original text */
  endOffset: number;
  /** Normalized value (e.g. dollar amount → number, date → ISO string) */
  normalizedValue?: string | number | Date;
}

export interface EntityExtractionConfig {
  /** Use Claude for entity extraction (more accurate, costs API calls) */
  useAI?: boolean;
  /** Anthropic API key (required if useAI=true) */
  apiKey?: string;
  /** Model for AI extraction (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Minimum confidence threshold (default: 0.6) */
  minConfidence?: number;
  /** Custom entity patterns to extend defaults */
  customPatterns?: Array<{
    type: string;
    pattern: RegExp;
    normalizer?: (match: string) => string | number;
  }>;
}

// ============================================================================
// PATTERNS
// ============================================================================

// Known technology keywords (cross-domain)
const TECHNOLOGIES = new Set([
  'react', 'vue', 'angular', 'svelte', 'nextjs', 'next.js', 'nuxt',
  'node', 'node.js', 'deno', 'bun', 'express', 'fastify', 'nestjs',
  'typescript', 'javascript', 'python', 'java', 'go', 'rust', 'ruby',
  'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch',
  'aws', 'gcp', 'azure', 'vercel', 'netlify', 'cloudflare',
  'docker', 'kubernetes', 'k8s', 'terraform', 'ansible',
  'github', 'gitlab', 'bitbucket', 'jira', 'confluence',
  'stripe', 'hubspot', 'salesforce', 'intercom', 'zendesk',
  'slack', 'notion', 'figma', 'linear', 'asana',
  'supabase', 'firebase', 'prisma', 'drizzle',
  'graphql', 'rest', 'grpc', 'websocket',
  'openai', 'anthropic', 'claude', 'gpt', 'llm',
  'amplitude', 'mixpanel', 'segment', 'datadog', 'sentry',
]);

// Known business metrics (all domains)
const METRICS = new Set([
  'mrr', 'arr', 'nps', 'csat', 'nrr', 'grr', 'ltv', 'cac', 'arpu', 'arpa',
  'churn', 'churn rate', 'retention', 'retention rate',
  'dso', 'dpo', 'burn rate', 'runway',
  'mql', 'sql', 'pql', 'conversion rate', 'win rate',
  'dau', 'mau', 'wau', 'engagement',
  'fte', 'headcount', 'attrition', 'turnover',
  'sprint velocity', 'cycle time', 'mttr', 'mttd', 'mtbf',
  'throughput', 'latency', 'uptime', 'availability',
  'pipeline', 'pipeline coverage', 'quota attainment',
  'gross margin', 'ebitda', 'revenue', 'profit',
  'aov', 'gmv', 'take rate',
]);

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create an entity extractor.
 */
export function createEntityExtractor(config?: EntityExtractionConfig) {
  const minConfidence = config?.minConfidence ?? 0.6;

  /**
   * Fast regex-based extraction (no API calls)
   */
  function extractFromText(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // ── Email addresses ────────────────────────────────────────────
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    for (const match of text.matchAll(emailRegex)) {
      entities.push({
        text: match[0],
        type: 'email',
        confidence: 0.95,
        startOffset: match.index!,
        endOffset: match.index! + match[0].length,
      });
    }

    // ── URLs ───────────────────────────────────────────────────────
    const urlRegex = /https?:\/\/[^\s<>"')\]]+/g;
    for (const match of text.matchAll(urlRegex)) {
      entities.push({
        text: match[0],
        type: 'url',
        confidence: 0.95,
        startOffset: match.index!,
        endOffset: match.index! + match[0].length,
      });
    }

    // ── Dollar amounts ─────────────────────────────────────────────
    const amountRegex = /\$[\d,]+(?:\.\d{1,2})?(?:\s*[KMBkmb])?/g;
    for (const match of text.matchAll(amountRegex)) {
      const raw = match[0].replace(/[$,]/g, '');
      let value = parseFloat(raw);
      const suffix = raw.match(/[KMBkmb]$/)?.[0]?.toUpperCase();
      if (suffix === 'K') value *= 1000;
      if (suffix === 'M') value *= 1000000;
      if (suffix === 'B') value *= 1000000000;

      entities.push({
        text: match[0],
        type: 'amount',
        confidence: 0.95,
        startOffset: match.index!,
        endOffset: match.index! + match[0].length,
        normalizedValue: value,
      });
    }

    // ── Percentages ────────────────────────────────────────────────
    const percentRegex = /\d+(?:\.\d+)?%/g;
    for (const match of text.matchAll(percentRegex)) {
      entities.push({
        text: match[0],
        type: 'percentage',
        confidence: 0.9,
        startOffset: match.index!,
        endOffset: match.index! + match[0].length,
        normalizedValue: parseFloat(match[0]) / 100,
      });
    }

    // ── Dates ──────────────────────────────────────────────────────
    // ISO dates
    const isoDateRegex = /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/g;
    for (const match of text.matchAll(isoDateRegex)) {
      entities.push({
        text: match[0],
        type: 'date',
        confidence: 0.95,
        startOffset: match.index!,
        endOffset: match.index! + match[0].length,
        normalizedValue: new Date(match[0]),
      });
    }

    // Natural dates (Jan 15, 2025 or January 15, 2025)
    const naturalDateRegex =
      /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s*\d{4})?/gi;
    for (const match of text.matchAll(naturalDateRegex)) {
      entities.push({
        text: match[0],
        type: 'date',
        confidence: 0.9,
        startOffset: match.index!,
        endOffset: match.index! + match[0].length,
        normalizedValue: new Date(match[0]),
      });
    }

    // MM/DD/YYYY
    const slashDateRegex = /\d{1,2}\/\d{1,2}\/\d{4}/g;
    for (const match of text.matchAll(slashDateRegex)) {
      entities.push({
        text: match[0],
        type: 'date',
        confidence: 0.8,
        startOffset: match.index!,
        endOffset: match.index! + match[0].length,
        normalizedValue: new Date(match[0]),
      });
    }

    // ── @mentions ──────────────────────────────────────────────────
    const mentionRegex = /@[\w.-]+/g;
    for (const match of text.matchAll(mentionRegex)) {
      // Skip if already captured as email
      const isEmail = entities.some(
        (e) => e.type === 'email' && e.startOffset <= match.index! && e.endOffset > match.index!
      );
      if (!isEmail) {
        entities.push({
          text: match[0],
          type: 'mention',
          confidence: 0.85,
          startOffset: match.index!,
          endOffset: match.index! + match[0].length,
        });
      }
    }

    // ── Company suffixes ───────────────────────────────────────────
    const companyRegex = /([\w\s]+?)\s+(?:Inc|Corp|Ltd|LLC|GmbH|Co|Pty|AG|SA|NV|PLC)\b\.?/gi;
    for (const match of text.matchAll(companyRegex)) {
      const companyName = match[0].trim();
      if (companyName.length > 3) {
        entities.push({
          text: companyName,
          type: 'company',
          confidence: 0.8,
          startOffset: match.index!,
          endOffset: match.index! + match[0].length,
        });
      }
    }

    // ── Technologies ───────────────────────────────────────────────
    const words = text.split(/[\s,;:()[\]{}]+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase().replace(/[.!?'"]/g, '');
      if (TECHNOLOGIES.has(word) && word.length > 1) {
        const idx = text.toLowerCase().indexOf(word);
        if (idx >= 0) {
          entities.push({
            text: words[i].replace(/[.!?'"]/g, ''),
            type: 'technology',
            confidence: 0.85,
            startOffset: idx,
            endOffset: idx + word.length,
          });
        }
      }
    }

    // ── Business Metrics ───────────────────────────────────────────
    const lowerText = text.toLowerCase();
    for (const metric of METRICS) {
      const idx = lowerText.indexOf(metric);
      if (idx >= 0) {
        entities.push({
          text: text.substring(idx, idx + metric.length),
          type: 'metric',
          confidence: 0.85,
          startOffset: idx,
          endOffset: idx + metric.length,
        });
      }
    }

    // Apply custom patterns
    if (config?.customPatterns) {
      for (const pattern of config.customPatterns) {
        for (const match of text.matchAll(pattern.pattern)) {
          entities.push({
            text: match[0],
            type: pattern.type as any,
            confidence: 0.8,
            startOffset: match.index!,
            endOffset: match.index! + match[0].length,
            normalizedValue: pattern.normalizer?.(match[0]),
          });
        }
      }
    }

    // Filter by confidence and deduplicate overlapping entities
    return deduplicateEntities(
      entities.filter((e) => e.confidence >= minConfidence)
    );
  }

  /**
   * Remove overlapping entities, keeping highest confidence
   */
  function deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const sorted = entities.sort((a, b) => b.confidence - a.confidence);
    const result: ExtractedEntity[] = [];

    for (const entity of sorted) {
      const overlaps = result.some(
        (e) =>
          entity.startOffset >= e.startOffset &&
          entity.startOffset < e.endOffset
      );
      if (!overlaps) {
        result.push(entity);
      }
    }

    return result.sort((a, b) => a.startOffset - b.startOffset);
  }

  /**
   * AI-powered extraction using Claude (more accurate, costs API calls)
   */
  async function extractWithAI(text: string): Promise<ExtractedEntity[]> {
    if (!config?.apiKey) {
      throw new Error('AI extraction requires apiKey in config');
    }

    const prompt = `Extract all entities from the following text. Return a JSON array of objects with these fields:
- text: the exact text matched
- type: one of "person", "company", "product", "date", "amount", "percentage", "technology", "metric", "email", "url", "mention"
- confidence: 0-1 float
- normalizedValue: normalized form (number for amounts, ISO string for dates, etc.)

Text: "${text}"

Return ONLY the JSON array, no other text.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config?.model || 'claude-3-5-haiku-20241022', // Cost optimization: Haiku for structured JSON extraction
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = (await response.json()) as any;
    const responseText = data.content?.[0]?.text || '[]';

    try {
      // Parse JSON from response (handle markdown code blocks)
      const jsonStr = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(jsonStr) as any[];

      return parsed.map((e: any, idx: number) => ({
        text: e.text || '',
        type: e.type || 'unknown',
        confidence: e.confidence || 0.8,
        startOffset: text.indexOf(e.text) >= 0 ? text.indexOf(e.text) : idx * 10,
        endOffset:
          text.indexOf(e.text) >= 0
            ? text.indexOf(e.text) + (e.text?.length || 0)
            : idx * 10,
        normalizedValue: e.normalizedValue,
      }));
    } catch {
      // Fall back to regex if AI parsing fails
      return extractFromText(text);
    }
  }

  return {
    extractFromText,
    extractWithAI,
  };
}
