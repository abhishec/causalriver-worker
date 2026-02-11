/**
 * LLM Knowledge Distiller — Sensory Cortex (Perception Layer)
 * ============================================================
 *
 * Brain Analog: The Sensory Cortex processes raw environmental input
 * (light, sound, touch) and converts it into structured neural signals.
 * A human reads a newspaper article about "interest rate hikes causing
 * housing slowdowns" and their brain automatically extracts the causal
 * relationship: FedFunds↑ → HousingStarts↓ (lag: ~90d, effect: -0.3).
 *
 * This module does the same: it takes raw text from public sources
 * (Wikipedia, news, research papers, economic reports) and uses an LLM
 * to extract structured causal knowledge as TrainingPacks.
 *
 * The LLM acts as a "universal sensor" — it can read ANY text and extract
 * causal relationships, business rules, cascade patterns, and anomaly
 * signatures that the brain's learning modules can then internalize.
 *
 * Pipeline:
 *   Raw Text → LLM Extraction → Structured TrainingPack → Brain Training
 *
 * This is how the brain PERCEIVES the world — converting unstructured
 * information into structured knowledge it can reason about.
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for the knowledge distiller */
export interface KnowledgeDistillerConfig {
  /** LLM provider to use */
  provider: 'anthropic' | 'openai';
  /** API key for the LLM provider */
  apiKey: string;
  /** Model to use (defaults to claude-sonnet-4-5-20250929 for Anthropic, gpt-4o for OpenAI) */
  model?: string;
  /** Max tokens per LLM call */
  maxTokens?: number;
  /** Verbose logging */
  verbose?: boolean;
}

/** A piece of raw content to distill knowledge from */
export interface RawContent {
  /** Unique identifier */
  id: string;
  /** Source name (e.g., 'wikipedia', 'fred_report', 'news') */
  source: string;
  /** Title or headline */
  title: string;
  /** The raw text content */
  text: string;
  /** When this content was published/fetched */
  fetchedAt: string;
  /** Domain hint for better extraction */
  domainHint?: string;
}

/** A causal pattern extracted by the LLM */
export interface ExtractedCausalPattern {
  source_domain: string;
  target_domain: string;
  effect_direction: 'positive' | 'negative';
  estimated_effect_size: number;
  estimated_lag_days: number;
  confidence: number;
  explanation: string;
}

/** A business rule extracted by the LLM */
export interface ExtractedRule {
  title: string;
  condition: string;
  action: string;
  domains: string[];
  confidence: number;
}

/** A cascade pattern extracted by the LLM */
export interface ExtractedCascade {
  chain: string[];
  trigger: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  explanation: string;
}

/** Result from distilling a single piece of content */
export interface DistillationResult {
  /** Source content ID */
  contentId: string;
  /** Extracted causal patterns */
  causalPatterns: ExtractedCausalPattern[];
  /** Extracted rules */
  rules: ExtractedRule[];
  /** Extracted cascades */
  cascades: ExtractedCascade[];
  /** Number of distinct domains found */
  domainsFound: string[];
  /** LLM confidence in overall extraction quality */
  extractionConfidence: number;
  /** Token usage */
  tokensUsed: { input: number; output: number };
  /** Duration in ms */
  durationMs: number;
}

/** Training pack in the format brain-trainer expects */
export interface DistilledTrainingPack {
  id: string;
  title: string;
  source: string;
  industry: string;
  domains: string[];
  tags: string[];
  confidence: number;
  causalChains: Array<{
    source: string;
    target: string;
    metric: string;
    effectSize: number;
    lagDays: number;
    pValue?: number;
  }>;
  businessRules: Array<{
    title: string;
    entityType: string;
    when: { conditions: Array<{ field: string; operator: string; value: unknown }>; logic: 'AND' | 'OR' };
    then: Array<{ type: string; template: string }>;
    naturalLanguage: string;
    priority?: number;
  }>;
  cascades: Array<{
    source: string;
    target: string;
    type: 'blocks' | 'delays' | 'impacts' | 'enables' | 'triggers';
    severity: 'low' | 'medium' | 'high' | 'critical';
    keywords: { source: string[]; target: string[] };
    reasonTemplate?: string;
  }>;
  patterns: Array<{
    name: string;
    domains: string[];
    observed: number;
    expected: number;
    total: number;
    description?: string;
  }>;
  outcomes: Array<{
    prediction: string;
    actual: string;
    domain: string;
    accuracy: number;
  }>;
}

/** Full distillation session result */
export interface DistillationSessionResult {
  /** All content items processed */
  itemsProcessed: number;
  /** Successful extractions */
  itemsSucceeded: number;
  /** Failed extractions */
  itemsFailed: number;
  /** Total causal patterns extracted */
  totalCausalPatterns: number;
  /** Total rules extracted */
  totalRules: number;
  /** Total cascades extracted */
  totalCascades: number;
  /** Generated training pack */
  trainingPack: DistilledTrainingPack;
  /** Per-item results */
  results: DistillationResult[];
  /** Duration in ms */
  totalDurationMs: number;
}

// ============================================================================
// EXTRACTION PROMPT
// ============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are a causal intelligence extraction system. Your job is to read text about business, economics, technology, or organizational dynamics and extract STRUCTURED causal knowledge.

For every piece of text, extract:

1. CAUSAL PATTERNS: "X causes Y" relationships with:
   - source_domain and target_domain (use snake_case, e.g., "marketing", "revenue", "engineering", "support", "macro_economy")
   - effect_direction: "positive" (X↑ → Y↑) or "negative" (X↑ → Y↓)
   - estimated_effect_size: 0.0-1.0 scale (how strong is the effect?)
   - estimated_lag_days: how many days before the effect manifests
   - confidence: your confidence in this relationship (0.0-1.0)
   - explanation: brief explanation

2. BUSINESS RULES: "When X, then Y" with:
   - title: short rule name
   - condition: what triggers the rule
   - action: what should happen
   - domains: which business domains are involved
   - confidence: your confidence (0.0-1.0)

3. CASCADE PATTERNS: chain reactions across domains:
   - chain: ordered list of domains affected (e.g., ["engineering", "product", "support", "churn"])
   - trigger: what starts the cascade
   - severity: "low", "medium", "high", or "critical"
   - explanation: how the cascade propagates

Focus on ACTIONABLE business intelligence. Prioritize relationships that an organization could measure and act on.

Respond ONLY with valid JSON in this exact format:
{
  "causal_patterns": [...],
  "rules": [...],
  "cascades": [...],
  "domains_found": [...],
  "extraction_confidence": 0.0-1.0
}`;

// ============================================================================
// LLM KNOWLEDGE DISTILLER
// ============================================================================

export function createLLMKnowledgeDistiller(config: KnowledgeDistillerConfig) {
  const {
    provider,
    apiKey,
    model,
    maxTokens = 4096,
    verbose = false,
  } = config;

  function log(msg: string): void {
    if (verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [DISTILLER] ${msg}`);
    }
  }

  /**
   * Call the LLM to extract structured knowledge from text.
   * Brain Analog: Sensory processing — raw photons → structured visual percepts
   */
  async function callLLM(text: string, title: string): Promise<{
    response: string;
    tokensUsed: { input: number; output: number };
  }> {
    const userMessage = `Extract causal knowledge from this content:

Title: ${title}

Content:
${text.slice(0, 12000)}`;

    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-5-20250929',
          max_tokens: maxTokens,
          system: EXTRACTION_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      const data = (await response.json()) as any;
      return {
        response: data.content?.[0]?.text || '{}',
        tokensUsed: {
          input: data.usage?.input_tokens || 0,
          output: data.usage?.output_tokens || 0,
        },
      };
    } else {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o',
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
      });

      const data = (await response.json()) as any;
      return {
        response: data.choices?.[0]?.message?.content || '{}',
        tokensUsed: {
          input: data.usage?.prompt_tokens || 0,
          output: data.usage?.completion_tokens || 0,
        },
      };
    }
  }

  /**
   * Parse LLM response into structured extraction results.
   * Brain Analog: Pattern recognition — extracting meaningful signals from noise
   */
  function parseExtraction(raw: string): {
    causalPatterns: ExtractedCausalPattern[];
    rules: ExtractedRule[];
    cascades: ExtractedCascade[];
    domainsFound: string[];
    extractionConfidence: number;
  } {
    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      let jsonStr = raw;
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr.trim());

      return {
        causalPatterns: (parsed.causal_patterns || []).map((p: any) => ({
          source_domain: String(p.source_domain || ''),
          target_domain: String(p.target_domain || ''),
          effect_direction: p.effect_direction === 'negative' ? 'negative' : 'positive',
          estimated_effect_size: Math.min(1, Math.max(0, Number(p.estimated_effect_size) || 0.3)),
          estimated_lag_days: Math.max(0, Number(p.estimated_lag_days) || 30),
          confidence: Math.min(1, Math.max(0, Number(p.confidence) || 0.5)),
          explanation: String(p.explanation || ''),
        })),
        rules: (parsed.rules || []).map((r: any) => ({
          title: String(r.title || ''),
          condition: String(r.condition || ''),
          action: String(r.action || ''),
          domains: Array.isArray(r.domains) ? r.domains.map(String) : [],
          confidence: Math.min(1, Math.max(0, Number(r.confidence) || 0.5)),
        })),
        cascades: (parsed.cascades || []).map((c: any) => ({
          chain: Array.isArray(c.chain) ? c.chain.map(String) : [],
          trigger: String(c.trigger || ''),
          severity: ['low', 'medium', 'high', 'critical'].includes(c.severity) ? c.severity : 'medium',
          explanation: String(c.explanation || ''),
        })),
        domainsFound: Array.isArray(parsed.domains_found) ? parsed.domains_found.map(String) : [],
        extractionConfidence: Math.min(1, Math.max(0, Number(parsed.extraction_confidence) || 0.5)),
      };
    } catch {
      // LLM returned unparseable response — empty extraction
      return {
        causalPatterns: [],
        rules: [],
        cascades: [],
        domainsFound: [],
        extractionConfidence: 0,
      };
    }
  }

  /**
   * Distill knowledge from a single piece of content.
   * Brain Analog: Processing a single sensory input through the cortical column
   */
  async function distill(content: RawContent): Promise<DistillationResult> {
    const start = Date.now();
    log(`Distilling: "${content.title}" from ${content.source}`);

    try {
      const { response, tokensUsed } = await callLLM(content.text, content.title);
      const extraction = parseExtraction(response);

      log(`  → ${extraction.causalPatterns.length} causal, ${extraction.rules.length} rules, ${extraction.cascades.length} cascades`);

      return {
        contentId: content.id,
        causalPatterns: extraction.causalPatterns,
        rules: extraction.rules,
        cascades: extraction.cascades,
        domainsFound: extraction.domainsFound,
        extractionConfidence: extraction.extractionConfidence,
        tokensUsed,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      log(`  → FAILED: ${err.message}`);
      return {
        contentId: content.id,
        causalPatterns: [],
        rules: [],
        cascades: [],
        domainsFound: [],
        extractionConfidence: 0,
        tokensUsed: { input: 0, output: 0 },
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Distill a batch of content items and produce a combined TrainingPack.
   *
   * Brain Analog: A full day of sensory experience — reading multiple articles,
   * observing multiple events — consolidated into a single coherent memory update
   * during sleep. The brain doesn't store raw sensory data; it extracts patterns
   * and relationships, then strengthens the relevant synapses.
   */
  async function distillBatch(
    contents: RawContent[],
    options: { batchId?: string; sequential?: boolean } = {}
  ): Promise<DistillationSessionResult> {
    const overallStart = Date.now();
    const batchId = options.batchId || `distill_${Date.now()}`;

    log(`Starting distillation batch: ${contents.length} items (${options.sequential ? 'sequential' : 'parallel'})`);

    // Process items (sequentially to avoid rate limits, or parallel for speed)
    const results: DistillationResult[] = [];

    if (options.sequential) {
      for (const content of contents) {
        const result = await distill(content);
        results.push(result);
      }
    } else {
      // Process in batches of 3 to respect rate limits
      for (let i = 0; i < contents.length; i += 3) {
        const batch = contents.slice(i, i + 3);
        const batchResults = await Promise.all(batch.map(c => distill(c)));
        results.push(...batchResults);
      }
    }

    // Aggregate all extractions into a single TrainingPack
    const allCausalPatterns = results.flatMap(r => r.causalPatterns);
    const allRules = results.flatMap(r => r.rules);
    const allCascades = results.flatMap(r => r.cascades);
    const allDomains = [...new Set(results.flatMap(r => r.domainsFound))];

    const succeededCount = results.filter(r => r.causalPatterns.length > 0 || r.rules.length > 0 || r.cascades.length > 0).length;
    const failedCount = results.length - succeededCount;

    // Build the TrainingPack
    const trainingPack = buildTrainingPack(
      batchId,
      allCausalPatterns,
      allRules,
      allCascades,
      allDomains,
      contents.map(c => c.source)
    );

    const totalDurationMs = Date.now() - overallStart;

    log(`Distillation complete: ${succeededCount}/${results.length} items, ` +
        `${allCausalPatterns.length} causal, ${allRules.length} rules, ${allCascades.length} cascades in ${totalDurationMs}ms`);

    return {
      itemsProcessed: results.length,
      itemsSucceeded: succeededCount,
      itemsFailed: failedCount,
      totalCausalPatterns: allCausalPatterns.length,
      totalRules: allRules.length,
      totalCascades: allCascades.length,
      trainingPack,
      results,
      totalDurationMs,
    };
  }

  /**
   * Build a TrainingPack from extracted patterns.
   * Brain Analog: Memory consolidation — taking scattered neural activations
   * from the day and organizing them into coherent long-term memories.
   */
  function buildTrainingPack(
    batchId: string,
    causalPatterns: ExtractedCausalPattern[],
    rules: ExtractedRule[],
    cascades: ExtractedCascade[],
    domains: string[],
    sources: string[]
  ): DistilledTrainingPack {
    // De-duplicate causal patterns (same source→target)
    const uniquePatterns = new Map<string, ExtractedCausalPattern>();
    for (const p of causalPatterns) {
      const key = `${p.source_domain}→${p.target_domain}`;
      const existing = uniquePatterns.get(key);
      if (!existing || p.confidence > existing.confidence) {
        uniquePatterns.set(key, p);
      }
    }

    const causalChains = [...uniquePatterns.values()].map(p => ({
      source: p.source_domain,
      target: p.target_domain,
      metric: `${p.source_domain}_to_${p.target_domain}`,
      effectSize: p.effect_direction === 'negative' ? -p.estimated_effect_size : p.estimated_effect_size,
      lagDays: p.estimated_lag_days,
      pValue: Math.max(0.001, 1 - p.confidence),
    }));

    const businessRules = rules.map(r => ({
      title: r.title,
      entityType: 'metric',
      when: {
        conditions: [{ field: 'condition', operator: 'matches' as string, value: r.condition }],
        logic: 'AND' as const,
      },
      then: [{ type: 'alert' as string, template: r.action }],
      naturalLanguage: `When ${r.condition}, then ${r.action}`,
      priority: Math.round(r.confidence * 100),
    }));

    const cascadeEntries = cascades.map(c => ({
      source: c.chain[0] || 'unknown',
      target: c.chain[c.chain.length - 1] || 'unknown',
      type: 'triggers' as const,
      severity: c.severity,
      keywords: {
        source: [c.chain[0] || 'unknown', c.trigger],
        target: [c.chain[c.chain.length - 1] || 'unknown'],
      },
      reasonTemplate: c.explanation,
    }));

    const avgConfidence = causalPatterns.length > 0
      ? causalPatterns.reduce((sum, p) => sum + p.confidence, 0) / causalPatterns.length
      : 0.5;

    return {
      id: `llm_distilled_${batchId}`,
      title: `LLM-Distilled Knowledge (${new Date().toISOString().split('T')[0]})`,
      source: `llm-knowledge-distiller: ${[...new Set(sources)].join(', ')}`,
      industry: 'cross-industry',
      domains,
      tags: ['llm-distilled', 'public-data', 'auto-generated'],
      confidence: avgConfidence,
      causalChains,
      businessRules,
      cascades: cascadeEntries,
      patterns: [],
      outcomes: [],
    };
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  return {
    /**
     * Distill knowledge from a single piece of content.
     * Returns extracted causal patterns, rules, and cascades.
     */
    distill,

    /**
     * Distill a batch of content items and produce a combined TrainingPack.
     * This is the primary method — feed it articles, reports, or any text.
     */
    distillBatch,

    /**
     * Build a TrainingPack from pre-extracted patterns (useful for testing
     * or when you have patterns from non-LLM sources).
     */
    buildTrainingPack,

    /**
     * Parse a raw LLM response string into structured extraction results.
     * Exposed for testing.
     */
    parseExtraction,
  };
}
