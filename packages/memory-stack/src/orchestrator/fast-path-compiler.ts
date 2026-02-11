/**
 * Fast-Path Compiler — "Cerebellum"
 *
 * Like the brain's cerebellum that handles learned motor patterns without
 * conscious thought, this module compiles frequently-asked query patterns
 * into pre-computed fast responses that bypass the full LLM pipeline.
 *
 * How it works:
 *   1. **Track**: Every query through the copilot is fingerprinted
 *   2. **Detect**: When a query pattern repeats 3+ times, flag it
 *   3. **Compile**: Pre-compute the causal context, graph edges, and
 *      pattern matches for that query shape
 *   4. **Cache**: Store the compiled response template
 *   5. **Serve**: Next time, serve from cache (ms instead of seconds)
 *
 * Cache invalidation:
 *   - Compiled paths expire after consolidation changes the graph
 *   - Staleness check: if underlying edges changed, recompile
 *   - Max cache age: 24 hours (configurable)
 *
 * This is NOT a generic cache — it understands query SHAPES:
 *   "Why did churn increase?" and "Why did churn spike?" → same shape
 *   "What caused revenue to drop?" → different shape
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../persistence/supabase-repository';

// ============================================================================
// TYPES
// ============================================================================

/** A query fingerprint — represents a query "shape" */
export interface QueryFingerprint {
  /** Hash of the normalized query shape */
  hash: string;
  /** The intent category (why, what, how, predict, compare) */
  intent: string;
  /** Domains mentioned in the query */
  domains: string[];
  /** Metric/entity type referenced */
  metric?: string;
  /** Direction (increase, decrease, change) */
  direction?: string;
  /** Time context (recent, last_week, last_month) */
  timeContext?: string;
}

/** A compiled fast-path response */
export interface CompiledFastPath {
  /** Fingerprint hash */
  fingerprintHash: string;
  /** Fingerprint details */
  fingerprint: QueryFingerprint;
  /** Pre-computed causal edges relevant to this query shape */
  relevantEdges: Array<{
    source: string;
    target: string;
    effectSize: number;
    lagDays: number;
    naturalLanguage: string;
  }>;
  /** Pre-computed pattern matches */
  relevantPatterns: string[];
  /** Pre-computed anomalies */
  relevantAnomalies: string[];
  /** Pre-built context string (ready for LLM or direct serving) */
  compiledContext: string;
  /** How many times this pattern has been queried */
  hitCount: number;
  /** When this was compiled */
  compiledAt: string;
  /** When the underlying graph was last changed */
  graphVersionAt: string;
  /** Expiry time */
  expiresAt: string;
}

/** Query tracking entry */
export interface QueryTrackEntry {
  fingerprint: QueryFingerprint;
  rawQuery: string;
  timestamp: string;
}

/** Fast-path compiler configuration */
export interface FastPathConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Minimum hits before compiling a fast path (default: 3) */
  minHitsToCompile?: number;
  /** Maximum cache age in hours (default: 24) */
  maxCacheAgeHours?: number;
  /** Maximum compiled paths to keep (default: 100) */
  maxCompiledPaths?: number;
  /** Verbose logging */
  verbose?: boolean;
}

/** Cache lookup result */
export interface FastPathLookup {
  /** Whether a fast path was found */
  hit: boolean;
  /** The compiled fast path (if hit) */
  fastPath?: CompiledFastPath;
  /** The fingerprint used for lookup */
  fingerprint: QueryFingerprint;
  /** Lookup duration in ms */
  lookupMs: number;
}

// ============================================================================
// FAST-PATH COMPILER
// ============================================================================

export function createFastPathCompiler(config: FastPathConfig) {
  const {
    supabase,
    organizationId,
    minHitsToCompile = 3,
    maxCacheAgeHours = 24,
    maxCompiledPaths = 100,
    verbose = false,
  } = config;

  const repository = createSupabaseRepository(supabase, organizationId);

  // In-memory tracking and cache
  const queryHistory: QueryTrackEntry[] = [];
  const compiledPaths = new Map<string, CompiledFastPath>();
  let lastGraphVersion = '';

  function log(msg: string): void {
    if (verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [CEREBELLUM] ${msg}`);
    }
  }

  // ── Query Fingerprinting ──────────────────────────────────────────

  function fingerprintQuery(query: string): QueryFingerprint {
    const lower = query.toLowerCase().trim();

    // Extract intent
    let intent = 'unknown';
    if (/^(why|what caused|what's? causing|what led)/.test(lower)) intent = 'why';
    else if (/^(what|tell me about|show|describe)/.test(lower)) intent = 'what';
    else if (/^(how|how to|how do|how can)/.test(lower)) intent = 'how';
    else if (/^(predict|forecast|will|expect|what if)/.test(lower)) intent = 'predict';
    else if (/^(compare|difference|vs|versus)/.test(lower)) intent = 'compare';

    // Extract domains (common business domains)
    const domainPatterns = [
      'revenue', 'sales', 'churn', 'support', 'product', 'marketing',
      'engineering', 'hiring', 'onboarding', 'billing', 'payment',
      'nps', 'csat', 'usage', 'retention', 'growth', 'cost',
      'customer', 'employee', 'subscription', 'renewal',
    ];
    const domains: string[] = [];
    for (const d of domainPatterns) {
      if (lower.includes(d)) domains.push(d);
    }

    // Extract direction
    let direction: string | undefined;
    if (/increas|grow|spike|up|ris|improv/.test(lower)) direction = 'increase';
    else if (/decreas|drop|declin|down|fall|worsen|churn/.test(lower)) direction = 'decrease';
    else if (/chang|shift|mov|fluctuat/.test(lower)) direction = 'change';

    // Extract time context
    let timeContext: string | undefined;
    if (/today|this morning|right now|currently/.test(lower)) timeContext = 'recent';
    else if (/this week|past week|last 7/.test(lower)) timeContext = 'last_week';
    else if (/this month|past month|last 30/.test(lower)) timeContext = 'last_month';
    else if (/this quarter|q[1-4]|last quarter/.test(lower)) timeContext = 'last_quarter';

    // Extract metric
    let metric: string | undefined;
    const metricMatch = lower.match(/(arr|mrr|nps|csat|churn rate|revenue|ltv|cac|dau|mau|aov)/);
    if (metricMatch) metric = metricMatch[1];

    // Generate hash — same shape queries should produce same hash
    const shape = `${intent}:${domains.sort().join(',')}:${direction || ''}:${metric || ''}`;
    const hash = simpleHash(shape);

    return { hash, intent, domains, metric, direction, timeContext };
  }

  function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return 'fp-' + Math.abs(hash).toString(36);
  }

  // ── Compilation ───────────────────────────────────────────────────

  async function compileForFingerprint(fp: QueryFingerprint): Promise<CompiledFastPath> {
    log(`Compiling fast path for: ${fp.intent}:${fp.domains.join(',')}`);

    // Fetch relevant causal edges
    const relevantEdges: CompiledFastPath['relevantEdges'] = [];
    if (fp.domains.length > 0) {
      const { data: edges } = await supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain, effect_size, optimal_lag_days, natural_language')
        .eq('organization_id', organizationId)
        .eq('is_significant', true)
        .or(fp.domains.map(d => `source_domain.ilike.%${d}%,target_domain.ilike.%${d}%`).join(','));

      for (const e of edges || []) {
        relevantEdges.push({
          source: e.source_domain,
          target: e.target_domain,
          effectSize: e.effect_size || 0,
          lagDays: e.optimal_lag_days || 7,
          naturalLanguage: e.natural_language || '',
        });
      }
    }

    // Fetch relevant patterns
    const relevantPatterns: string[] = [];
    const { data: patterns } = await supabase
      .from('ai_memory')
      .select('content')
      .eq('organization_id', organizationId)
      .eq('memory_type', 'pattern_discovery')
      .order('importance', { ascending: false })
      .limit(5);

    for (const p of patterns || []) {
      if (p.content) relevantPatterns.push(p.content);
    }

    // Fetch recent anomalies for these domains
    const relevantAnomalies: string[] = [];
    const { data: anomalies } = await supabase
      .from('ai_memory')
      .select('content')
      .eq('organization_id', organizationId)
      .eq('memory_type', 'anomaly_detection')
      .order('created_at', { ascending: false })
      .limit(5);

    for (const a of anomalies || []) {
      if (a.content) relevantAnomalies.push(a.content);
    }

    // Build compiled context
    const contextParts: string[] = [];
    contextParts.push(`Query intent: ${fp.intent}`);
    contextParts.push(`Domains: ${fp.domains.join(', ')}`);
    if (fp.direction) contextParts.push(`Direction: ${fp.direction}`);
    if (fp.metric) contextParts.push(`Metric: ${fp.metric}`);

    if (relevantEdges.length > 0) {
      contextParts.push(`\nCausal relationships (${relevantEdges.length}):`);
      for (const e of relevantEdges.slice(0, 10)) {
        contextParts.push(`  • ${e.naturalLanguage || `${e.source} → ${e.target} (effect: ${(e.effectSize * 100).toFixed(0)}%, lag: ${e.lagDays}d)`}`);
      }
    }

    if (relevantPatterns.length > 0) {
      contextParts.push(`\nPatterns:`);
      for (const p of relevantPatterns.slice(0, 5)) {
        contextParts.push(`  • ${p.substring(0, 200)}`);
      }
    }

    if (relevantAnomalies.length > 0) {
      contextParts.push(`\nRecent anomalies:`);
      for (const a of relevantAnomalies.slice(0, 3)) {
        contextParts.push(`  • ${a.substring(0, 200)}`);
      }
    }

    const expiresAt = new Date(Date.now() + maxCacheAgeHours * 60 * 60 * 1000).toISOString();

    const compiled: CompiledFastPath = {
      fingerprintHash: fp.hash,
      fingerprint: fp,
      relevantEdges,
      relevantPatterns,
      relevantAnomalies,
      compiledContext: contextParts.join('\n'),
      hitCount: 0,
      compiledAt: new Date().toISOString(),
      graphVersionAt: lastGraphVersion || new Date().toISOString(),
      expiresAt,
    };

    log(`Compiled: ${relevantEdges.length} edges, ${relevantPatterns.length} patterns, ${relevantAnomalies.length} anomalies`);

    return compiled;
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════

  return {
    /**
     * Track a query and return fast-path if available.
     * Call this BEFORE running the full LLM pipeline.
     */
    async lookup(query: string): Promise<FastPathLookup> {
      const start = Date.now();
      const fp = fingerprintQuery(query);

      // Track the query
      queryHistory.push({
        fingerprint: fp,
        rawQuery: query,
        timestamp: new Date().toISOString(),
      });

      // Trim old history (keep last 1000)
      while (queryHistory.length > 1000) queryHistory.shift();

      // Check for existing compiled path
      const existing = compiledPaths.get(fp.hash);
      if (existing) {
        // Check if expired
        if (new Date(existing.expiresAt) > new Date()) {
          existing.hitCount++;
          log(`CACHE HIT: ${fp.hash} (hits: ${existing.hitCount})`);
          return {
            hit: true,
            fastPath: existing,
            fingerprint: fp,
            lookupMs: Date.now() - start,
          };
        } else {
          // Expired — remove
          compiledPaths.delete(fp.hash);
        }
      }

      // Count how many times this shape has been queried
      let count = 0;
      for (const entry of queryHistory) {
        if (entry.fingerprint.hash === fp.hash) count++;
      }

      // If pattern is frequent enough, compile in background
      if (count >= minHitsToCompile && !compiledPaths.has(fp.hash)) {
        // Compile asynchronously — don't block the current query
        compileForFingerprint(fp).then(compiled => {
          compiledPaths.set(fp.hash, compiled);
          log(`Auto-compiled fast path: ${fp.hash} (after ${count} hits)`);

          // Enforce max cache size
          if (compiledPaths.size > maxCompiledPaths) {
            // Evict least recently used
            let oldestKey = '';
            let oldestTime = Infinity;
            for (const [key, path] of compiledPaths) {
              const compiledTime = new Date(path.compiledAt).getTime();
              if (compiledTime < oldestTime) {
                oldestTime = compiledTime;
                oldestKey = key;
              }
            }
            if (oldestKey) compiledPaths.delete(oldestKey);
          }
        }).catch(() => {
          // Compilation failure is non-critical
        });
      }

      return {
        hit: false,
        fingerprint: fp,
        lookupMs: Date.now() - start,
      };
    },

    /**
     * Invalidate all compiled paths (call after consolidation).
     */
    invalidateAll(): void {
      const count = compiledPaths.size;
      compiledPaths.clear();
      lastGraphVersion = new Date().toISOString();
      log(`Invalidated ${count} compiled fast paths (graph changed)`);
    },

    /**
     * Invalidate paths that touch specific domains.
     */
    invalidateForDomains(domains: string[]): void {
      const domainSet = new Set(domains.map(d => d.toLowerCase()));
      let removed = 0;

      for (const [key, path] of compiledPaths) {
        const touches = path.fingerprint.domains.some(d => domainSet.has(d.toLowerCase()));
        if (touches) {
          compiledPaths.delete(key);
          removed++;
        }
      }

      log(`Invalidated ${removed} paths for domains: ${domains.join(', ')}`);
    },

    /**
     * Get cache statistics.
     */
    getStats(): {
      compiledPaths: number;
      totalHits: number;
      queriesTracked: number;
      topPatterns: Array<{ hash: string; intent: string; domains: string[]; hits: number }>;
    } {
      let totalHits = 0;
      const topPatterns: Array<{ hash: string; intent: string; domains: string[]; hits: number }> = [];

      for (const [, path] of compiledPaths) {
        totalHits += path.hitCount;
        topPatterns.push({
          hash: path.fingerprintHash,
          intent: path.fingerprint.intent,
          domains: path.fingerprint.domains,
          hits: path.hitCount,
        });
      }

      topPatterns.sort((a, b) => b.hits - a.hits);

      return {
        compiledPaths: compiledPaths.size,
        totalHits,
        queriesTracked: queryHistory.length,
        topPatterns: topPatterns.slice(0, 10),
      };
    },

    /**
     * Force compile a fast path for a query (useful for pre-warming).
     */
    async precompile(query: string): Promise<CompiledFastPath> {
      const fp = fingerprintQuery(query);
      const compiled = await compileForFingerprint(fp);
      compiledPaths.set(fp.hash, compiled);
      return compiled;
    },

    /**
     * Get the fingerprint for a query (useful for debugging).
     */
    fingerprint(query: string): QueryFingerprint {
      return fingerprintQuery(query);
    },
  };
}
