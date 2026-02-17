/**
 * Federated Brain — Dual-Query Layer for ORG + CORE Intelligence
 * ================================================================
 *
 * Implements Knowledge Federation:
 *
 *   nexus-query / agent-loop
 *     1. Fetch ORG data  ─┐
 *     2. Fetch CORE data ─┤  (Promise.all)
 *     3. Merge + Dedup    ◀┘
 *     4. Labeled LLM prompt
 *          ↙          ↘
 *   ORG Brain          CORE Brain
 *   org: <real_id>     org: 00000..00
 *   (PRIORITY)         (BASELINE)
 *
 * ORG data always takes priority. CORE provides industry baselines.
 * CORE is READ-ONLY from org perspective. High-confidence org patterns
 * can be anonymized and "percolated" up to CORE for collective learning.
 *
 * Part of v11.6.0: Knowledge Federation
 */

import { getClientForTableInEdge } from './get-brain-client';
import {
  semanticDedup,
  semanticDedupAsync,
  type SemanticFederationConfig,
} from './semantic-federation';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * The CORE Brain organization ID — a well-known UUID for shared baseline knowledge.
 * MUST match the canonical CORE_BRAIN_ORG_ID used by upstream-promoter, consolidation-engine,
 * and all other federation writers. Previously this was '..0000' which caused a silent
 * data black hole — promoted knowledge was never read back.
 */
export const CORE_ORGANIZATION_ID = '00000000-0000-4000-a000-000000000001';

// ============================================================================
// TYPES
// ============================================================================

/** Source label for federated query results */
export type SourceLabel = 'org' | 'core';

/** A single result item labeled with its source */
export interface LabeledResult<T = Record<string, unknown>> {
  data: T;
  source: SourceLabel;
  priority: number; // 1 = org (high), 2 = core (baseline)
}

/** Full result from a federated query */
export interface FederatedQueryResult<T = Record<string, unknown>> {
  orgResults: T[];
  coreResults: T[];
  merged: LabeledResult<T>[];
  stats: {
    orgCount: number;
    coreCount: number;
    duplicatesRemoved: number;
    /** Whether semantic dedup was used (vs string-based) */
    semanticDedupUsed: boolean;
    /** Number of semantic comparisons performed */
    semanticComparisons?: number;
    federatedAt: string;
  };
}

/** Options for federated queries */
export interface FederatedQueryOptions<T = Record<string, unknown>> {
  /** Field to deduplicate on (ORG wins over CORE). Use string key from the result type. */
  deduplicateBy?: string;
  /**
   * Enable semantic deduplication using cosine similarity on embeddings.
   * When enabled, items with similarity > threshold (default 0.82) are treated
   * as duplicates even if their text differs. ORG always wins.
   *
   * Requires `semanticTextField` to extract embeddable text from each item.
   * Falls back to string-based dedup if not provided.
   */
  semanticDedup?: boolean;
  /**
   * Field(s) to extract text from for semantic embedding.
   * Can be a single field name or a function that extracts text from an item.
   * Only used when `semanticDedup` is true.
   */
  semanticTextField?: string | ((item: T) => string);
  /**
   * Configuration for semantic federation (thresholds, dimensions).
   * Only used when `semanticDedup` is true.
   */
  semanticConfig?: SemanticFederationConfig;
  /** Whether to include CORE brain data. Default: true */
  includeCoreData?: boolean;
  /** Max CORE results to return (limits baseline noise). Default: same as ORG limit */
  coreLimit?: number;
  /**
   * Max age for CORE data in days. Default: 365.
   * At 10M+ signals, querying the entire CORE brain is slow. This limits CORE queries
   * to recently-computed data. ORG queries are NOT filtered by time (org data is always small enough).
   */
  coreMaxAgeDays?: number;
  /**
   * Per-query timeout in milliseconds. Default: 5000 (5 seconds).
   * Prevents cascading failures when CORE query stalls (network, slow scan).
   * If CORE times out, ORG results are returned alone — graceful degradation.
   */
  queryTimeoutMs?: number;
}

// ============================================================================
// CORE PROTECTION
// ============================================================================

/**
 * Check if an organization ID is the CORE brain (protected/read-only)
 */
export function isCoreOrganization(organizationId: string): boolean {
  return organizationId === CORE_ORGANIZATION_ID;
}

/**
 * Guard: Validate that writes are NOT targeting the CORE brain.
 * CORE data is read-only from the application perspective.
 * Only the seed-core-brain admin function may write to CORE.
 *
 * @throws Error if attempting to write to CORE
 */
export function assertWriteAllowed(organizationId: string, operation: string): void {
  if (isCoreOrganization(organizationId)) {
    throw new Error(
      `[FederatedBrain] BLOCKED: Cannot ${operation} to CORE brain (${CORE_ORGANIZATION_ID}). ` +
      `CORE data is read-only. Use the real organization_id for writes.`
    );
  }
}

// ============================================================================
// GENERIC FEDERATED QUERY ENGINE
// ============================================================================

/**
 * Execute a federated query against BOTH ORG and CORE brains.
 * Uses Promise.all for parallel execution, then merges + deduplicates.
 *
 * @param tableName - Brain table to query (used for client routing)
 * @param organizationId - The real org's UUID (CORE_ORGANIZATION_ID is added automatically)
 * @param queryBuilder - Function that builds a Supabase query given a client and orgId
 * @param options - Deduplication and federation options
 * @returns Merged, labeled, deduplicated results with stats
 */
export async function federatedQuery<T = Record<string, unknown>>(
  tableName: string,
  organizationId: string,
  queryBuilder: (client: ReturnType<typeof getClientForTableInEdge>, orgId: string, maxAgeCutoff?: string) => Promise<{ data: T[] | null; error: any }>,
  options: FederatedQueryOptions<T> = {}
): Promise<FederatedQueryResult<T>> {
  const {
    deduplicateBy,
    semanticDedup: useSemanticDedup = false,
    semanticTextField,
    semanticConfig,
    includeCoreData = true,
    coreMaxAgeDays = 365,
    queryTimeoutMs = 5000,
  } = options;
  const client = getClientForTableInEdge(tableName);

  // Time-based partitioning for CORE queries: at 10M+ signals, scanning all CORE data is O(n).
  // By filtering to recent data (default: last 365 days), we reduce scan to O(recent).
  // ORG data is NOT filtered — org-specific data is always small enough.
  const coreMaxAgeCutoff = new Date(Date.now() - coreMaxAgeDays * 24 * 60 * 60 * 1000).toISOString();

  // Per-query timeout: prevents cascading failures when CORE hangs (network, slow scan).
  // If CORE times out, ORG results are returned alone — graceful degradation.
  const withQueryTimeout = <R>(promise: Promise<R>, label: string): Promise<R> =>
    new Promise<R>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Federation ${label} query timed out after ${queryTimeoutMs}ms`)), queryTimeoutMs);
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); }
      );
    });

  // Parallel queries to ORG and CORE
  // CORE query gets a time cutoff for 10M+ scalability (index scan vs full table scan)
  const [orgResult, coreResult] = await Promise.all([
    withQueryTimeout(
      queryBuilder(client, organizationId),
      `ORG:${tableName}`
    ).catch(err => {
      console.error(`[FederatedBrain] ORG query error on ${tableName}:`, err);
      return { data: [] as T[], error: err };
    }),
    includeCoreData
      ? withQueryTimeout(
          queryBuilder(client, CORE_ORGANIZATION_ID, coreMaxAgeCutoff),
          `CORE:${tableName}`
        ).catch(err => {
          console.warn(`[FederatedBrain] CORE query error on ${tableName} (non-fatal):`, err);
          return { data: [] as T[], error: err };
        })
      : Promise.resolve({ data: [] as T[], error: null })
  ]);

  const orgData = (orgResult.data || []) as T[];
  const coreData = (coreResult.data || []) as T[];

  // ──────────────────────────────────────────────────────────────────────
  // MERGE + DEDUP: Two strategies based on configuration
  //
  // 1. SEMANTIC DEDUP (new): Cosine similarity on embeddings. Catches
  //    paraphrases, synonyms, and rephrased knowledge that string matching
  //    misses entirely. "PR velocity declining" ≈ "Pull request throughput
  //    dropping" → detected as duplicate, ORG wins.
  //
  // 2. STRING DEDUP (legacy): Exact field equality. Fast but blind to
  //    semantic equivalence. Used as fallback when no text extractor.
  // ──────────────────────────────────────────────────────────────────────

  let merged: LabeledResult<T>[];
  let duplicatesRemoved = 0;
  let semanticDedupUsed = false;
  let semanticComparisons: number | undefined;

  // Build text extractor function from config
  const textExtractor: ((item: T) => string) | undefined =
    useSemanticDedup && semanticTextField
      ? typeof semanticTextField === 'function'
        ? semanticTextField
        : (item: T) => {
            const val = (item as any)[semanticTextField as string];
            return typeof val === 'string' ? val : JSON.stringify(val || '');
          }
      : undefined;

  if (textExtractor && orgData.length + coreData.length > 0) {
    // SEMANTIC DEDUP — The brain's pattern consolidation
    // Use async neural version when neuralConfig is provided (catches paraphrases),
    // fall back to sync n-gram when not (zero API calls, backward compatible).
    semanticDedupUsed = true;
    const dedupResult = semanticConfig?.neuralConfig?.apiKey
      ? await semanticDedupAsync(orgData, coreData, textExtractor, semanticConfig)
      : semanticDedup(orgData, coreData, textExtractor, semanticConfig);

    merged = dedupResult.kept.map(({ item, source }) => ({
      data: item,
      source: source as SourceLabel,
      priority: source === 'org' ? 1 : 2,
    }));
    duplicatesRemoved = dedupResult.stats.totalRemoved;
    semanticComparisons = dedupResult.stats.comparisons;
  } else {
    // STRING DEDUP — Legacy fallback
    const labeledOrg: LabeledResult<T>[] = orgData.map(item => ({
      data: item,
      source: 'org' as SourceLabel,
      priority: 1
    }));

    const labeledCore: LabeledResult<T>[] = coreData.map(item => ({
      data: item,
      source: 'core' as SourceLabel,
      priority: 2
    }));

    merged = [...labeledOrg, ...labeledCore];

    if (deduplicateBy && merged.length > 0) {
      const seen = new Set<string>();
      const deduplicated: LabeledResult<T>[] = [];

      for (const item of merged) {
        const key = String((item.data as any)[deduplicateBy] || '');
        if (key && seen.has(key)) {
          duplicatesRemoved++;
        } else {
          if (key) seen.add(key);
          deduplicated.push(item);
        }
      }
      merged = deduplicated;
    }
  }

  return {
    orgResults: orgData,
    coreResults: coreData,
    merged,
    stats: {
      orgCount: orgData.length,
      coreCount: coreData.length,
      duplicatesRemoved,
      semanticDedupUsed,
      semanticComparisons,
      federatedAt: new Date().toISOString()
    }
  };
}

// ============================================================================
// SPECIALIZED FEDERATED QUERIES
// ============================================================================

/**
 * Federated query for ai_memory patterns (L3 Domain Knowledge)
 */
export async function getFederatedPatterns(
  organizationId: string,
  options: {
    memoryType?: string;
    minConfidence?: number;
    limit?: number;
    includeCoreData?: boolean;
  } = {}
): Promise<FederatedQueryResult<any>> {
  const { memoryType, minConfidence = 0.5, limit = 20, includeCoreData = true } = options;

  return federatedQuery(
    'ai_memory',
    organizationId,
    async (client, orgId, maxAgeCutoff) => {
      let query = client
        .from('ai_memory')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .gte('confidence', minConfidence)
        .order('confidence', { ascending: false });

      if (memoryType) {
        query = query.eq('memory_type', memoryType);
      }

      // Time-based partitioning for CORE queries at 10M+ scale
      if (maxAgeCutoff) {
        query = query.gte('created_at', maxAgeCutoff);
      }

      return query.limit(limit);
    },
    {
      deduplicateBy: 'title',
      semanticDedup: true,
      semanticTextField: (item: any) =>
        `${item.title || ''} ${item.memory_type || ''} ${item.domain || ''} ${
          typeof item.content === 'string' ? item.content : JSON.stringify(item.content || '')
        }`.trim(),
      includeCoreData,
    }
  );
}

/**
 * Federated query for causal relationships (L4 Statistical Causality)
 */
export async function getFederatedCausalRelationships(
  organizationId: string,
  options: {
    limit?: number;
    includeCoreData?: boolean;
  } = {}
): Promise<FederatedQueryResult<any>> {
  const { limit = 15, includeCoreData = true } = options;

  return federatedQuery(
    'causal_relationships_statistical',
    organizationId,
    async (client, orgId, maxAgeCutoff) => {
      let query = client
        .from('causal_relationships_statistical')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_significant', true)
        .order('effect_size', { ascending: false })
        .limit(limit);

      // Time-based partitioning: CORE queries filter by recency to avoid full-table scan at 10M+
      if (maxAgeCutoff) {
        query = query.gte('last_computed_at', maxAgeCutoff);
      }

      return query;
    },
    {
      deduplicateBy: 'id',
      semanticDedup: true,
      semanticTextField: (item: any) =>
        `${item.source_domain || ''} causes ${item.target_domain || ''} ${item.natural_language || ''}`.trim(),
      includeCoreData,
    }
  );
}

/**
 * Federated query for brain grammar rules (L3 Domain Knowledge)
 */
export async function getFederatedGrammarRules(
  organizationId: string,
  options: {
    limit?: number;
    includeCoreData?: boolean;
    coreMaxAgeDays?: number;
  } = {}
): Promise<FederatedQueryResult<any>> {
  const { limit = 20, includeCoreData = true, coreMaxAgeDays = 365 } = options;

  return federatedQuery(
    'brain_grammar_rules',
    organizationId,
    async (client, orgId, maxAgeCutoff) => {
      let query = client
        .from('brain_grammar_rules')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('confidence', { ascending: false });

      if (maxAgeCutoff) {
        query = query.gte('created_at', maxAgeCutoff);
      }

      return query.limit(limit);
    },
    {
      deduplicateBy: 'rule_type',
      semanticDedup: true,
      semanticTextField: (item: any) =>
        `${item.rule_type || ''} ${item.natural_language || ''} ${item.domain || ''}`.trim(),
      includeCoreData,
      coreMaxAgeDays,
    }
  );
}

/**
 * Federated query for causal chains (L4 Statistical Causality)
 */
export async function getFederatedCausalChains(
  organizationId: string,
  options: {
    validatedOnly?: boolean;
    minConfidence?: number;
    limit?: number;
    includeCoreData?: boolean;
    coreMaxAgeDays?: number;
  } = {}
): Promise<FederatedQueryResult<any>> {
  const { validatedOnly = true, minConfidence = 0.5, limit = 20, includeCoreData = true, coreMaxAgeDays = 365 } = options;

  return federatedQuery(
    'causal_chains',
    organizationId,
    async (client, orgId, maxAgeCutoff) => {
      let query = client
        .from('causal_chains')
        .select('*')
        .eq('organization_id', orgId)
        .gte('confidence', minConfidence)
        .order('confidence', { ascending: false });

      if (validatedOnly) {
        query = query.eq('validated', true);
      }
      if (maxAgeCutoff) {
        query = query.gte('created_at', maxAgeCutoff);
      }

      return query.limit(limit);
    },
    { deduplicateBy: 'id', includeCoreData, coreMaxAgeDays }
  );
}

/**
 * Federated query for causal insights (L5 Learning)
 */
export async function getFederatedCausalInsights(
  organizationId: string,
  options: {
    insightType?: string;
    limit?: number;
    includeCoreData?: boolean;
    coreMaxAgeDays?: number;
  } = {}
): Promise<FederatedQueryResult<any>> {
  const { insightType, limit = 20, includeCoreData = true, coreMaxAgeDays = 365 } = options;

  return federatedQuery(
    'causal_insights',
    organizationId,
    async (client, orgId, maxAgeCutoff) => {
      let query = client
        .from('causal_insights')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (insightType) {
        query = query.eq('insight_type', insightType);
      }
      if (maxAgeCutoff) {
        query = query.gte('created_at', maxAgeCutoff);
      }

      return query.limit(limit);
    },
    { includeCoreData, coreMaxAgeDays }
  );
}

/**
 * Federated query for cross-domain signals (L7 Intelligence)
 */
export async function getFederatedCrossDomainSignals(
  organizationId: string,
  options: {
    daysSince?: number;
    limit?: number;
    includeCoreData?: boolean;
    coreMaxAgeDays?: number;
  } = {}
): Promise<FederatedQueryResult<any>> {
  const { daysSince = 30, limit = 100, includeCoreData = true, coreMaxAgeDays = 365 } = options;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysSince);

  return federatedQuery(
    'cross_domain_signals',
    organizationId,
    async (client, orgId, maxAgeCutoff) => {
      let query = client
        .from('cross_domain_signals')
        .select('*')
        .eq('organization_id', orgId)
        .gte('signal_timestamp', cutoffDate.toISOString())
        .order('signal_timestamp', { ascending: false });

      if (maxAgeCutoff) {
        query = query.gte('created_at', maxAgeCutoff);
      }

      return query.limit(limit);
    },
    { includeCoreData, coreMaxAgeDays }
  );
}

/**
 * Federated query for domain relationships (L7 Intelligence)
 */
export async function getFederatedDomainRelationships(
  organizationId: string,
  options: {
    includeCoreData?: boolean;
    coreMaxAgeDays?: number;
  } = {}
): Promise<FederatedQueryResult<any>> {
  const { includeCoreData = true, coreMaxAgeDays = 365 } = options;

  return federatedQuery(
    'ai_domain_relationships',
    organizationId,
    async (client, orgId, maxAgeCutoff) => {
      let query = client
        .from('ai_domain_relationships')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('strength', { ascending: false });

      if (maxAgeCutoff) {
        query = query.gte('created_at', maxAgeCutoff);
      }

      return query.limit(20);
    },
    { deduplicateBy: 'id', includeCoreData, coreMaxAgeDays }
  );
}

/**
 * Federated query for prediction records (L6 Prediction)
 */
export async function getFederatedPredictionRecords(
  organizationId: string,
  options: {
    predictionType?: string;
    verifiedOnly?: boolean;
    limit?: number;
    includeCoreData?: boolean;
    coreMaxAgeDays?: number;
  } = {}
): Promise<FederatedQueryResult<any>> {
  const { predictionType, verifiedOnly = false, limit = 50, includeCoreData = true, coreMaxAgeDays = 365 } = options;

  return federatedQuery(
    'prediction_records',
    organizationId,
    async (client, orgId, maxAgeCutoff) => {
      let query = client
        .from('prediction_records')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (predictionType) {
        query = query.eq('prediction_type', predictionType);
      }
      if (verifiedOnly) {
        query = query.eq('outcome_verified', true);
      }
      if (maxAgeCutoff) {
        query = query.gte('created_at', maxAgeCutoff);
      }

      return query.limit(limit);
    },
    { includeCoreData, coreMaxAgeDays }
  );
}

/**
 * Federated query for active cascades (L5 Causal River)
 */
export async function getFederatedActiveCascades(
  organizationId: string,
  options: {
    limit?: number;
    includeCoreData?: boolean;
    coreMaxAgeDays?: number;
  } = {}
): Promise<FederatedQueryResult<any>> {
  const { limit = 20, includeCoreData = true, coreMaxAgeDays = 365 } = options;

  return federatedQuery(
    'active_cascades',
    organizationId,
    async (client, orgId, maxAgeCutoff) => {
      let query = client
        .from('active_cascades')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .order('detected_at', { ascending: false });

      if (maxAgeCutoff) {
        query = query.gte('detected_at', maxAgeCutoff);
      }

      return query.limit(limit);
    },
    { includeCoreData, coreMaxAgeDays }
  );
}

// ============================================================================
// LLM PROMPT FORMATTING
// ============================================================================

/**
 * Build a labeled prompt section from federated query results.
 * Separates ORG (priority) from CORE (baseline) with clear headers.
 */
export function buildFederatedPromptSection(
  sectionTitle: string,
  result: FederatedQueryResult<any>,
  formatter: (item: any) => string
): string {
  const orgLines = result.orgResults.map(formatter).filter(Boolean);
  const coreLines = result.coreResults.map(formatter).filter(Boolean);

  let section = `## ${sectionTitle}\n`;

  if (orgLines.length > 0) {
    section += `### YOUR ORGANIZATION (Priority - Use These First)\n`;
    section += orgLines.join('\n') + '\n';
  } else {
    section += `### YOUR ORGANIZATION\nNo organization-specific data yet.\n`;
  }

  if (coreLines.length > 0) {
    section += `### INDUSTRY BASELINE (Reference)\n`;
    section += coreLines.join('\n') + '\n';
  }

  return section;
}

/**
 * Format a flat list of labeled results for agent memory context.
 * Adds [ORG] or [BASELINE] prefix to each item.
 */
export function formatLabeledForAgent<T>(
  merged: LabeledResult<T>[],
  formatter: (item: T) => string
): string {
  return merged
    .map(r => {
      const prefix = r.source === 'org' ? '[ORG]' : '[BASELINE]';
      return `${prefix} ${formatter(r.data)}`;
    })
    .join('\n');
}

// ============================================================================
// PERCOLATION — Promote high-confidence ORG patterns to CORE
// ============================================================================

/**
 * Percolate high-confidence org patterns to the CORE brain.
 * Patterns are anonymized (org-specific entity references removed)
 * before being promoted to the shared baseline.
 *
 * Criteria for promotion:
 * - Confidence >= 0.9
 * - Access count >= 5 (proven useful)
 * - Not already in CORE (dedup by title)
 *
 * @returns Number of patterns percolated
 */
export async function percolateToCore(
  organizationId: string,
  options: {
    minConfidence?: number;
    minAccessCount?: number;
    maxPerBatch?: number;
  } = {},
  /** Optional observability callback — wired by brain-pipeline to record percolation */
  onFederationOperation?: (data: {
    operationType: 'percolation';
    itemsProcessed: number;
    itemsPromoted: number;
    itemsRejected: number;
    durationMs: number;
  }) => void,
): Promise<{ percolated: number; skippedDuplicates: number }> {
  const { minConfidence = 0.9, minAccessCount = 5, maxPerBatch = 10 } = options;

  const _percolateStartMs = Date.now();

  // Guard: don't percolate FROM core TO core
  if (isCoreOrganization(organizationId)) {
    return { percolated: 0, skippedDuplicates: 0 };
  }

  const client = getClientForTableInEdge('ai_memory');

  // 1. Find high-confidence org patterns worthy of promotion
  const { data: candidates, error: candidateError } = await client
    .from('ai_memory')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .gte('confidence', minConfidence)
    .gte('access_count', minAccessCount)
    .in('memory_type', ['pattern', 'correlation', 'trend'])
    .order('confidence', { ascending: false })
    .limit(maxPerBatch);

  if (candidateError || !candidates?.length) {
    return { percolated: 0, skippedDuplicates: 0 };
  }

  // 2. Check which patterns already exist in CORE (semantic + exact dedup)
  //    Before: Only exact title matching → "High churn risk" ≠ "Elevated customer attrition"
  //    After:  Semantic novelty check → catches paraphrases, synonyms, rephrased insights
  const { data: existingCore } = await client
    .from('ai_memory')
    .select('title, content, domain')
    .eq('organization_id', CORE_ORGANIZATION_ID)
    .limit(200);

  const existingCoreTexts = (existingCore || []).map((e: any) => ({
    text: `${e.title || ''} ${e.domain || ''} ${typeof e.content === 'string' ? e.content : JSON.stringify(e.content || '')}`.trim(),
    metadata: { title: e.title },
  }));

  let skippedDuplicates = 0;

  // 3. Anonymize and insert new patterns into CORE (with semantic novelty check)
  const { checkSemanticNovelty: checkNovelty } = await import('./semantic-federation');

  const toPercolate = candidates
    .filter((c: any) => {
      // Semantic novelty check: Is this genuinely new knowledge for the CORE brain?
      const candidateText = `${c.title || ''} ${c.domain || ''} ${typeof c.content === 'string' ? c.content : JSON.stringify(c.content || '')}`.trim();
      const novelty = checkNovelty(candidateText, existingCoreTexts);
      if (!novelty.isNovel) {
        skippedDuplicates++;
        return false;
      }
      return true;
    })
    .map((c: any) => ({
      organization_id: CORE_ORGANIZATION_ID,
      memory_type: c.memory_type,
      title: c.title,
      content: anonymizeContent(c.content),
      confidence: Math.min(c.confidence, 0.95), // Cap at 0.95 for CORE
      severity: c.severity || 'info',
      domain: c.domain,
      is_active: true,
      entity_type: c.entity_type || 'pattern'
    }));

  if (toPercolate.length === 0) {
    return { percolated: 0, skippedDuplicates };
  }

  const { error: insertError } = await client
    .from('ai_memory')
    .insert(toPercolate);

  if (insertError) {
    console.error('[FederatedBrain] Percolation insert error:', insertError);
    return { percolated: 0, skippedDuplicates };
  }

  console.log(`[FederatedBrain] Percolated ${toPercolate.length} patterns from org ${organizationId} to CORE`);

  // OBSERVABILITY WIRE: Record percolation to obs_* tables
  if (onFederationOperation) {
    try {
      onFederationOperation({
        operationType: 'percolation',
        itemsProcessed: (candidates?.length ?? 0),
        itemsPromoted: toPercolate.length,
        itemsRejected: skippedDuplicates,
        durationMs: Date.now() - _percolateStartMs,
      });
    } catch { /* observability never breaks federation */ }
  }

  return { percolated: toPercolate.length, skippedDuplicates };
}

/**
 * Anonymize content before promoting to CORE brain.
 * Removes org-specific entity IDs, client names, and internal references.
 */
function anonymizeContent(content: Record<string, any>): Record<string, any> {
  const anonymized = { ...content };

  // Remove org-specific fields
  delete anonymized.entity_id;
  delete anonymized.client_id;
  delete anonymized.client_name;
  delete anonymized.organization_id;
  delete anonymized.user_id;
  delete anonymized.project_id;
  delete anonymized.contract_id;
  delete anonymized.invoice_id;
  delete anonymized.deal_id;

  // Mark as percolated from org learning
  anonymized.source = 'percolated_from_org';
  anonymized.percolated_at = new Date().toISOString();

  // Remove agent-specific metadata
  delete anonymized.agent_domain;
  delete anonymized.stored_by;

  return anonymized;
}
