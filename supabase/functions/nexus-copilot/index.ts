/**
 * Nexus Copilot v2 — Agentic Edge Function
 *
 * The intelligent copilot that replaces single-shot nexus-query with a
 * full agentic loop. Claude can autonomously call tools mapped to all
 * 7 brain layers, see results, reason, and iterate.
 *
 * ┌────────────────────────────────────────────────────────────────────┐
 * │                    NEXUSBRAIN COPILOT v2                           │
 * │                                                                    │
 * │  User ──▶ Complexity Router ──┬── FAST PATH (simple queries)      │
 * │                                │   Context + single LLM call       │
 * │                                │                                   │
 * │                                └── AGENTIC PATH (complex queries) │
 * │                                    Claude + 7-Layer Tools          │
 * │                                    Agentic loop with SSE stream   │
 * │                                                                    │
 * │  7-LAYER TOOL ACCESS:                                              │
 * │   L1 Ingestion      → ingest_signals                              │
 * │   L2 Entity Resolve → (handled internally by L1)                  │
 * │   L3 Semantic Memory → search_memory (pgvector RAG)               │
 * │   L4 Causal Engine   → query_causal_graph, trace_cascade          │
 * │   L5 Pattern Memory  → query_patterns, query_brain_rules          │
 * │   L6 Domain Agents   → get_domain_context                         │
 * │   L7 Intelligence    → predict_outcome, self_correct              │
 * │                                                                    │
 * │  KNOWLEDGE FEDERATION:                                             │
 * │   Core Brain (universal) + Org Brain (specific)                   │
 * │   Merged at query time, org takes priority                        │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * Request body:
 *   { organizationId, query, domain?, conversationId?, stream? }
 *
 * Response:
 *   stream=false → JSON { answer, toolCalls, context, meta }
 *   stream=true  → SSE stream of thinking/tool_calls/answer events
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// CONSTANTS
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

/** Maximum agentic loop iterations to prevent runaway */
const MAX_TOOL_ROUNDS = 8;

/** Maximum tokens for agentic responses */
const MAX_TOKENS_AGENTIC = 4096;

/** Maximum tokens for fast-path responses */
const MAX_TOKENS_FAST = 1024;

/** Fast-path cache TTL (24 hours) */
const FAST_PATH_CACHE_TTL_HOURS = 24;

// ============================================================================
// CEREBELLUM — Fast-Path Cache (pre-compiled query responses)
// Brain Analog: The Cerebellum stores learned motor programs. Once a query
// pattern has been seen enough times, the Cerebellum fires the pre-compiled
// context without conscious reasoning (no LLM context building needed).
// ============================================================================

interface QueryFingerprint {
  hash: string;
  intent: string;
  domains: string[];
  metric?: string;
  direction?: string;
  timeContext?: string;
}

/**
 * Fingerprint a query by extracting its "shape" — intent + domains + metric.
 * Two queries with the same shape get the same fingerprint, allowing cache reuse.
 */
function fingerprintQuery(query: string): QueryFingerprint {
  const q = query.toLowerCase();

  // Extract intent
  let intent = 'general';
  if (/\b(why|cause|caused|because|root cause|driving|reason)\b/.test(q)) intent = 'why';
  else if (/\b(what|status|current|now|today|latest)\b/.test(q)) intent = 'what';
  else if (/\b(how|way|method|approach|strategy)\b/.test(q)) intent = 'how';
  else if (/\b(predict|forecast|will|would|expect|project)\b/.test(q)) intent = 'predict';
  else if (/\b(compare|versus|vs|difference|between)\b/.test(q)) intent = 'compare';

  // Extract domain keywords
  const domainKeywords = [
    'revenue', 'churn', 'marketing', 'sales', 'engineering', 'support',
    'product', 'finance', 'hr', 'ops', 'customer', 'retention', 'growth',
    'nrr', 'mrr', 'arr', 'cac', 'ltv', 'nps', 'csat',
  ];
  const domains = domainKeywords.filter(d => q.includes(d)).sort();

  // Extract metric direction
  let direction: string | undefined;
  if (/\b(increas|grow|up|ris|improv|higher|more|spike)\b/.test(q)) direction = 'increase';
  else if (/\b(decreas|drop|down|fall|declin|lower|less|dip)\b/.test(q)) direction = 'decrease';

  // Extract time context
  let timeContext: string | undefined;
  if (/\b(today|now|current|real.?time)\b/.test(q)) timeContext = 'current';
  else if (/\b(week|weekly|7.?day)\b/.test(q)) timeContext = 'weekly';
  else if (/\b(month|monthly|30.?day)\b/.test(q)) timeContext = 'monthly';
  else if (/\b(quarter|quarterly|q[1-4]|90.?day)\b/.test(q)) timeContext = 'quarterly';
  else if (/\b(year|annual|yearly|12.?month)\b/.test(q)) timeContext = 'yearly';

  // Create deterministic hash from shape
  const shapeStr = `${intent}:${domains.join(',')}:${direction || ''}:${timeContext || ''}`;
  let hash = 0;
  for (let i = 0; i < shapeStr.length; i++) {
    const chr = shapeStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  const hashStr = `fp_${Math.abs(hash).toString(36)}`;

  return { hash: hashStr, intent, domains, metric: domains[0], direction, timeContext };
}

/**
 * Check the Cerebellum cache for a pre-compiled response context.
 * Returns the compiled context if found and not expired, null otherwise.
 */
async function cerebellumLookup(
  supabase: SupabaseClient,
  organizationId: string,
  fingerprint: QueryFingerprint,
): Promise<{ compiledContext: string; relevantEdges: any[] } | null> {
  try {
    const { data, error } = await supabase
      .from('fast_path_cache')
      .select('compiled_context, relevant_edges, hit_count')
      .eq('fingerprint_hash', fingerprint.hash)
      .eq('organization_id', organizationId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error || !data) return null;

    // Increment hit count (fire-and-forget)
    supabase
      .from('fast_path_cache')
      .update({ hit_count: (data.hit_count || 0) + 1 })
      .eq('fingerprint_hash', fingerprint.hash)
      .eq('organization_id', organizationId)
      .then(() => {});

    return {
      compiledContext: data.compiled_context,
      relevantEdges: data.relevant_edges || [],
    };
  } catch {
    // Cerebellum cache miss is non-fatal — fall through to conscious processing
    return null;
  }
}

/**
 * Record a query fingerprint in the Cerebellum cache for future fast-path use.
 * Only caches if the response was successful and context was built.
 */
async function cerebellumRecord(
  supabase: SupabaseClient,
  organizationId: string,
  fingerprint: QueryFingerprint,
  compiledContext: string,
  relevantEdges: any[] = [],
): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + FAST_PATH_CACHE_TTL_HOURS);

    await supabase
      .from('fast_path_cache')
      .upsert({
        fingerprint_hash: fingerprint.hash,
        organization_id: organizationId,
        fingerprint,
        compiled_context: compiledContext,
        relevant_edges: relevantEdges,
        hit_count: 0,
        compiled_at: new Date().toISOString(),
        graph_version_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      }, { onConflict: 'fingerprint_hash' });
  } catch {
    // Recording failure is non-fatal
  }
}

// ============================================================================
// COMPLEXITY ROUTER
// ============================================================================

type QueryComplexity = 'simple' | 'moderate' | 'complex';

interface ComplexityAssessment {
  level: QueryComplexity;
  score: number;
  reasons: string[];
  suggestedTools: string[];
}

/**
 * Score query complexity to decide fast-path vs agentic-path.
 *
 * Simple: direct lookup, status check, single-domain
 * Moderate: cross-domain, why questions, comparisons
 * Complex: multi-hop causal chains, predictions, what-if, cascade analysis
 */
function assessComplexity(query: string, domain?: string): ComplexityAssessment {
  const q = query.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  const suggestedTools: string[] = [];

  // --- Complexity boosters ---

  // Causal reasoning keywords
  if (/\b(why|cause|caused|because|root cause|driving|reason)\b/.test(q)) {
    score += 3;
    reasons.push('causal_reasoning_needed');
    suggestedTools.push('query_causal_graph');
  }

  // Prediction / what-if
  if (/\b(predict|forecast|will|would|what if|scenario|project)\b/.test(q)) {
    score += 3;
    reasons.push('prediction_requested');
    suggestedTools.push('predict_outcome', 'query_causal_graph');
  }

  // Cross-domain references
  const domains = ['finance', 'engineering', 'cs', 'marketing', 'people', 'revenue', 'sales', 'product', 'support'];
  const mentionedDomains = domains.filter(d => q.includes(d));
  if (mentionedDomains.length >= 2) {
    score += 2;
    reasons.push(`cross_domain: ${mentionedDomains.join(', ')}`);
    suggestedTools.push('query_causal_graph', 'get_domain_context');
  }

  // Cascade / chain / ripple analysis
  if (/\b(cascade|chain|ripple|downstream|upstream|domino|propagat)\b/.test(q)) {
    score += 3;
    reasons.push('cascade_analysis');
    suggestedTools.push('trace_cascade');
  }

  // Comparison / trade-off
  if (/\b(compare|versus|vs|trade.?off|better|worse|difference)\b/.test(q)) {
    score += 2;
    reasons.push('comparison_needed');
    suggestedTools.push('query_causal_graph', 'search_memory');
  }

  // How to / recommendation
  if (/\b(how to|how do|should we|recommend|suggest|action|intervention)\b/.test(q)) {
    score += 2;
    reasons.push('recommendation_requested');
    suggestedTools.push('query_patterns', 'query_causal_graph');
  }

  // Temporal / lag analysis
  if (/\b(lag|delay|time|when|how long|timeline|weeks?|months?|days?)\b/.test(q)) {
    score += 1;
    reasons.push('temporal_analysis');
    suggestedTools.push('query_causal_graph');
  }

  // Long query (more complex thought needed)
  if (query.split(/\s+/).length > 20) {
    score += 1;
    reasons.push('long_query');
  }

  // --- Simplicity indicators ---

  // Status check / simple lookup
  if (/\b(what is|status|current|show me|list|how many|count)\b/.test(q) && score < 3) {
    score -= 1;
    reasons.push('simple_lookup');
  }

  // Very short query
  if (query.split(/\s+/).length <= 5) {
    score -= 1;
    reasons.push('short_query');
  }

  // Classify
  const level: QueryComplexity =
    score <= 1 ? 'simple' :
    score <= 4 ? 'moderate' :
    'complex';

  // Always include search_memory for moderate+
  if (level !== 'simple' && !suggestedTools.includes('search_memory')) {
    suggestedTools.push('search_memory');
  }

  return {
    level,
    score: Math.max(0, score),
    reasons,
    suggestedTools: [...new Set(suggestedTools)],
  };
}

// ============================================================================
// 7-LAYER TOOL DEFINITIONS (for Claude tool_use API)
// ============================================================================

/**
 * Tool definitions mapped to NexusBrain's 7-layer architecture.
 *
 * Each tool exposes a specific brain layer's capability to Claude,
 * allowing the agentic loop to query any layer autonomously.
 *
 * L1 Ingestion:      ingest_signals
 * L2 Entity Resolve:  (internal to L1 — dedup handled automatically)
 * L3 Semantic Memory: search_memory
 * L4 Causal Engine:   query_causal_graph, trace_cascade
 * L5 Pattern Memory:  query_patterns, query_brain_rules
 * L6 Domain Agents:   get_domain_context
 * L7 Intelligence:    predict_outcome
 */
const COPILOT_TOOLS = [
  // ── L3: SEMANTIC MEMORY (RAG) ──
  {
    name: 'search_memory',
    description: 'Search organizational memory using semantic similarity (RAG). Returns relevant memories, past insights, and knowledge from the brain. Use this to find what the organization knows about a topic. Results include both org-specific memories and universal knowledge from the core brain.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' as const, description: 'Natural language search query' },
        domain: { type: 'string' as const, description: 'Optional domain filter (finance, engineering, cs, marketing, people, revenue)' },
        limit: { type: 'number' as const, description: 'Max results to return (default: 5)' },
      },
      required: ['query'] as const,
    },
  },

  // ── L4: CAUSAL ENGINE ──
  {
    name: 'query_causal_graph',
    description: 'Query the causal relationship graph. Returns statistically significant cause-effect relationships between business domains with Granger p-values, effect sizes, lag days, and confidence intervals. Distinguishes between org-specific discoveries and universal knowledge from the core brain. Use this when trying to understand WHY something is happening or what CAUSES what.',
    input_schema: {
      type: 'object' as const,
      properties: {
        source_domain: { type: 'string' as const, description: 'Filter by cause domain (e.g., "engineering")' },
        target_domain: { type: 'string' as const, description: 'Filter by effect domain (e.g., "cs")' },
        min_effect_size: { type: 'number' as const, description: 'Minimum effect size threshold (default: 0)' },
        include_core_brain: { type: 'boolean' as const, description: 'Include universal knowledge from core brain (default: true)' },
        limit: { type: 'number' as const, description: 'Max relationships to return (default: 15)' },
      },
      required: [] as const,
    },
  },
  {
    name: 'trace_cascade',
    description: 'Trace a causal cascade — follow the chain of cause-effect relationships starting from a trigger domain. Shows how a change in one domain ripples through the organization. Returns the cascade path, estimated timeline (using lag days), and severity. Use this for "what happens if X changes?" or "how does engineering affect revenue?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        trigger_domain: { type: 'string' as const, description: 'The domain where the change originates' },
        max_hops: { type: 'number' as const, description: 'Maximum cascade depth (default: 4)' },
        min_effect_size: { type: 'number' as const, description: 'Minimum effect size to follow (default: 0.05)' },
      },
      required: ['trigger_domain'] as const,
    },
  },

  // ── L5: PATTERN MEMORY ──
  {
    name: 'query_patterns',
    description: 'Query learned patterns and brain grammar rules. Returns organizational patterns discovered through causal learning — recurring behaviors, anomalies, and rules the brain has learned. Each pattern has a confidence score. Use this to understand what patterns the brain has detected.',
    input_schema: {
      type: 'object' as const,
      properties: {
        domain: { type: 'string' as const, description: 'Filter by domain' },
        min_confidence: { type: 'number' as const, description: 'Minimum confidence threshold 0-1 (default: 0.3)' },
        include_core_brain: { type: 'boolean' as const, description: 'Include universal patterns from core brain (default: true)' },
        limit: { type: 'number' as const, description: 'Max patterns to return (default: 10)' },
      },
      required: [] as const,
    },
  },

  // ── L6: DOMAIN AGENTS ──
  {
    name: 'get_domain_context',
    description: 'Get rich context about a specific business domain — its key metrics, related domains, causal connections, and active patterns. Use this to build a complete picture of a domain before answering domain-specific questions. Returns both org-specific and core brain knowledge.',
    input_schema: {
      type: 'object' as const,
      properties: {
        domain: { type: 'string' as const, description: 'The business domain to analyze (finance, engineering, cs, marketing, people, revenue)' },
        include_related: { type: 'boolean' as const, description: 'Include context from causally connected domains (default: true)' },
      },
      required: ['domain'] as const,
    },
  },

  // ── L7: INTELLIGENCE ──
  {
    name: 'predict_outcome',
    description: 'Generate a prediction about how a change in one domain will affect another. Uses the causal graph to estimate direction (increase/decrease), magnitude, timeline (based on lag days), and confidence. Use this for "what will happen if..." questions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        source_domain: { type: 'string' as const, description: 'Domain where the change is happening' },
        target_domain: { type: 'string' as const, description: 'Domain to predict the effect on' },
        change_direction: { type: 'string' as const, description: 'Direction of the change: "increase" or "decrease"' },
        change_magnitude: { type: 'number' as const, description: 'Relative magnitude of the change (0-1 scale, where 0.5 = moderate)' },
      },
      required: ['source_domain', 'target_domain', 'change_direction'] as const,
    },
  },

  // ── L1: INGESTION (write tool — Claude can feed signals) ──
  {
    name: 'ingest_signals',
    description: 'Ingest new business signals into the brain for future causal analysis. Use this when the user provides new data points or metrics that should be recorded. Signals are stored and will be analyzed in the next learning cycle.',
    input_schema: {
      type: 'object' as const,
      properties: {
        signals: {
          type: 'array' as const,
          description: 'Array of signals to ingest',
          items: {
            type: 'object' as const,
            properties: {
              source_domain: { type: 'string' as const, description: 'Business domain (finance, engineering, cs, marketing, people, revenue)' },
              signal_type: { type: 'string' as const, description: 'Signal name (e.g., mrr, ticket_count, deploy_frequency)' },
              signal_value: { type: 'number' as const, description: 'Numeric value of the signal' },
            },
            required: ['source_domain', 'signal_type', 'signal_value'] as const,
          },
        },
      },
      required: ['signals'] as const,
    },
  },

  // ── EXPERTISE: Contributor expertise graph queries ──
  {
    name: 'query_expertise',
    description: 'Find contributors with expertise in a specific code area, topic, or technology. Returns ranked experts with strength scores. Use when asked "who knows about X?", "who should review this?", "who is the expert on Y?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string' as const,
          description: 'Code path, technology, or domain area (e.g., "src/auth/", "react", "payment-service", "incident-response")',
        },
        limit: {
          type: 'number' as const,
          description: 'Maximum number of experts to return (default: 5)',
        },
        min_strength: {
          type: 'number' as const,
          description: 'Minimum expertise strength 0-1 (default: 0.1)',
        },
      },
      required: ['topic'] as const,
    },
  },

  // ── CODE CONTEXT: Search indexed code symbols ──
  {
    name: 'query_code_context',
    description: 'Search indexed code knowledge: functions, classes, components, services, and technical concepts stored in brain memory. Returns relevant code context, documentation, and technical knowledge. Use for "how does X work?", "where is Y implemented?", "explain the auth system"',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string' as const,
          description: 'What to search for in code knowledge (e.g., "authentication flow", "payment processing", "API rate limiting")',
        },
        domain: {
          type: 'string' as const,
          description: 'Optional domain filter (e.g., "engineering")',
        },
        limit: {
          type: 'number' as const,
          description: 'Maximum number of results (default: 10)',
        },
      },
      required: ['query'] as const,
    },
  },
];

// ============================================================================
// TOOL EXECUTION — Each tool queries the appropriate brain layer
// ============================================================================

/**
 * Execute a tool call against the brain's 7 layers.
 * Each tool maps to a specific layer and uses knowledge federation
 * (merging org-specific + core brain data).
 */
async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
  supabase: SupabaseClient,
  organizationId: string,
): Promise<any> {
  const isCoreBrain = organizationId === CORE_BRAIN_ORG_ID;

  switch (toolName) {
    // ── L3: SEMANTIC MEMORY (RAG search) ──
    case 'search_memory': {
      const limit = toolInput.limit || 5;
      const domain = toolInput.domain;

      // Fetch org memories + core brain memories in parallel
      const [orgResult, coreResult] = await Promise.all([
        supabase
          .from('ai_memory')
          .select('content, importance, memory_type, domain, created_at')
          .eq('organization_id', organizationId)
          .order('importance', { ascending: false })
          .limit(limit),
        isCoreBrain
          ? Promise.resolve({ data: [] })
          : supabase
              .from('ai_memory')
              .select('content, importance, memory_type, domain, created_at')
              .eq('organization_id', CORE_BRAIN_ORG_ID)
              .order('importance', { ascending: false })
              .limit(limit),
      ]);

      const orgMems = (orgResult.data || []).map((m: any) => ({ ...m, _source: 'org' }));
      const coreMems = (coreResult.data || []).map((m: any) => ({ ...m, _source: 'core' }));

      // Dedup: org takes priority
      const orgKeys = new Set(orgMems.map((m: any) => (m.content || '').substring(0, 80)));
      const uniqueCore = coreMems.filter((m: any) => !orgKeys.has((m.content || '').substring(0, 80)));

      let results = [...orgMems, ...uniqueCore];

      // Filter by domain if specified
      if (domain) {
        results = results.filter((m: any) => !m.domain || m.domain === domain);
      }

      return {
        memories: results.slice(0, limit),
        total: results.length,
        sources: { org: orgMems.length, core: uniqueCore.length },
      };
    }

    // ── L4: CAUSAL ENGINE — Query relationships ──
    case 'query_causal_graph': {
      const includeCoreFlag = toolInput.include_core_brain !== false;
      const limit = toolInput.limit || 15;
      const minEffect = toolInput.min_effect_size || 0;

      // Build org query
      let orgQuery = supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain, granger_f_statistic, granger_p_value, optimal_lag_days, effect_size, natural_language, is_significant, evidence_weight, confidence_interval_lower, confidence_interval_upper, sample_size, is_likely_confounded, knockout_score, coefficient_sign')
        .eq('organization_id', organizationId)
        .eq('is_significant', true)
        .order('effect_size', { ascending: false })
        .limit(limit);

      if (toolInput.source_domain) {
        orgQuery = orgQuery.eq('source_domain', toolInput.source_domain);
      }
      if (toolInput.target_domain) {
        orgQuery = orgQuery.eq('target_domain', toolInput.target_domain);
      }
      if (minEffect > 0) {
        orgQuery = orgQuery.gte('effect_size', minEffect);
      }

      // Build core brain query
      let coreQuery: any = isCoreBrain || !includeCoreFlag
        ? Promise.resolve({ data: [] })
        : (() => {
            let q = supabase
              .from('causal_relationships_statistical')
              .select('source_domain, target_domain, granger_f_statistic, granger_p_value, optimal_lag_days, effect_size, natural_language, is_significant, evidence_weight, confidence_interval_lower, confidence_interval_upper, sample_size, is_likely_confounded, knockout_score, coefficient_sign')
              .eq('organization_id', CORE_BRAIN_ORG_ID)
              .eq('is_significant', true)
              .order('effect_size', { ascending: false })
              .limit(limit);

            if (toolInput.source_domain) q = q.eq('source_domain', toolInput.source_domain);
            if (toolInput.target_domain) q = q.eq('target_domain', toolInput.target_domain);
            if (minEffect > 0) q = q.gte('effect_size', minEffect);
            return q;
          })();

      const [orgResult, coreResult] = await Promise.all([orgQuery, coreQuery]);

      const orgRels = (orgResult.data || []).map((r: any) => ({ ...r, _source: 'org' }));
      const coreRels = (coreResult.data || []).map((r: any) => ({ ...r, _source: 'core' }));

      // Dedup: org edges take priority
      const orgKeys = new Set(orgRels.map((r: any) => `${r.source_domain}::${r.target_domain}`));
      const uniqueCore = coreRels.filter((r: any) => !orgKeys.has(`${r.source_domain}::${r.target_domain}`));

      const merged = [...orgRels, ...uniqueCore];
      return {
        relationships: merged,
        count: merged.length,
        org_count: orgRels.length,
        core_count: uniqueCore.length,
        federation: !isCoreBrain && includeCoreFlag ? 'org + core brain merged' : 'org only',
      };
    }

    // ── L4: CAUSAL ENGINE — Trace cascade ──
    case 'trace_cascade': {
      const trigger = toolInput.trigger_domain;
      const maxHops = toolInput.max_hops || 4;
      const minEffect = toolInput.min_effect_size || 0.05;

      // Fetch all significant relationships (org + core)
      const [orgResult, coreResult] = await Promise.all([
        supabase
          .from('causal_relationships_statistical')
          .select('source_domain, target_domain, effect_size, optimal_lag_days, natural_language, granger_p_value')
          .eq('organization_id', organizationId)
          .eq('is_significant', true)
          .gte('effect_size', minEffect),
        isCoreBrain
          ? Promise.resolve({ data: [] })
          : supabase
              .from('causal_relationships_statistical')
              .select('source_domain, target_domain, effect_size, optimal_lag_days, natural_language, granger_p_value')
              .eq('organization_id', CORE_BRAIN_ORG_ID)
              .eq('is_significant', true)
              .gte('effect_size', minEffect),
      ]);

      // Build adjacency list from merged edges
      const allRels = [...(orgResult.data || []), ...(coreResult.data || [])];
      const adjacency = new Map<string, typeof allRels>();
      for (const rel of allRels) {
        const existing = adjacency.get(rel.source_domain) || [];
        // Dedup: keep highest effect_size per source->target
        const existingIdx = existing.findIndex(r => r.target_domain === rel.target_domain);
        if (existingIdx >= 0) {
          if (rel.effect_size > existing[existingIdx].effect_size) {
            existing[existingIdx] = rel;
          }
        } else {
          existing.push(rel);
        }
        adjacency.set(rel.source_domain, existing);
      }

      // BFS cascade trace
      const cascade: Array<{
        hop: number;
        from: string;
        to: string;
        effect_size: number;
        lag_days: number;
        cumulative_lag_days: number;
        description: string;
      }> = [];
      const visited = new Set<string>([trigger]);
      let frontier = [{ domain: trigger, cumulativeLag: 0, hop: 0 }];

      while (frontier.length > 0 && frontier[0].hop < maxHops) {
        const nextFrontier: typeof frontier = [];
        for (const node of frontier) {
          const edges = adjacency.get(node.domain) || [];
          for (const edge of edges) {
            if (!visited.has(edge.target_domain)) {
              visited.add(edge.target_domain);
              const cumulativeLag = node.cumulativeLag + (edge.optimal_lag_days || 0);
              cascade.push({
                hop: node.hop + 1,
                from: edge.source_domain,
                to: edge.target_domain,
                effect_size: edge.effect_size,
                lag_days: edge.optimal_lag_days || 0,
                cumulative_lag_days: cumulativeLag,
                description: edge.natural_language || `${edge.source_domain} → ${edge.target_domain}`,
              });
              nextFrontier.push({ domain: edge.target_domain, cumulativeLag, hop: node.hop + 1 });
            }
          }
        }
        frontier = nextFrontier;
      }

      // Calculate severity
      const totalEffectSize = cascade.reduce((sum, c) => sum + Math.abs(c.effect_size), 0);
      const avgEffectSize = cascade.length > 0 ? totalEffectSize / cascade.length : 0;
      const severity = Math.min(100, Math.round(avgEffectSize * cascade.length * 25));
      const totalTimelineDays = cascade.length > 0 ? Math.max(...cascade.map(c => c.cumulative_lag_days)) : 0;

      return {
        trigger_domain: trigger,
        cascade_path: cascade,
        total_domains_affected: cascade.length,
        severity_score: severity,
        total_timeline_days: totalTimelineDays,
        summary: cascade.length > 0
          ? `Change in ${trigger} cascades to ${cascade.length} domains over ~${totalTimelineDays} days (severity: ${severity}/100)`
          : `No downstream causal effects found from ${trigger}`,
      };
    }

    // ── L5: PATTERN MEMORY ──
    case 'query_patterns': {
      const domain = toolInput.domain;
      const minConf = toolInput.min_confidence || 0.3;
      const limit = toolInput.limit || 10;
      const includeCore = toolInput.include_core_brain !== false;

      const [orgResult, coreResult] = await Promise.all([
        (() => {
          let q = supabase
            .from('brain_grammar_rules')
            .select('id, domain, rule_type, natural_language, confidence, conditions, actions, is_active, created_at')
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .gte('confidence', minConf)
            .order('confidence', { ascending: false })
            .limit(limit);
          if (domain) q = q.eq('domain', domain);
          return q;
        })(),
        isCoreBrain || !includeCore
          ? Promise.resolve({ data: [] })
          : (() => {
              let q = supabase
                .from('brain_grammar_rules')
                .select('id, domain, rule_type, natural_language, confidence, conditions, actions, is_active, created_at')
                .eq('organization_id', CORE_BRAIN_ORG_ID)
                .eq('is_active', true)
                .gte('confidence', minConf)
                .order('confidence', { ascending: false })
                .limit(limit);
              if (domain) q = q.eq('domain', domain);
              return q;
            })(),
      ]);

      const orgPatterns = (orgResult.data || []).map((p: any) => ({ ...p, _source: 'org' }));
      const corePatterns = (coreResult.data || []).map((p: any) => ({ ...p, _source: 'core' }));

      // Dedup
      const orgKeys = new Set(orgPatterns.map((p: any) =>
        `${p.domain}::${p.rule_type}::${(p.natural_language || '').substring(0, 50)}`
      ));
      const uniqueCore = corePatterns.filter((p: any) =>
        !orgKeys.has(`${p.domain}::${p.rule_type}::${(p.natural_language || '').substring(0, 50)}`)
      );

      return {
        patterns: [...orgPatterns, ...uniqueCore].slice(0, limit),
        org_count: orgPatterns.length,
        core_count: uniqueCore.length,
      };
    }

    // ── L6: DOMAIN AGENTS — Get domain context ──
    case 'get_domain_context': {
      const domain = toolInput.domain;
      const includeRelated = toolInput.include_related !== false;

      // Fetch: causal edges involving this domain + patterns + memories
      const [causalResult, patternResult, memoryResult] = await Promise.all([
        // All causal edges where this domain is source OR target (org + core)
        supabase
          .from('causal_relationships_statistical')
          .select('source_domain, target_domain, effect_size, optimal_lag_days, natural_language, granger_p_value, is_likely_confounded, knockout_score')
          .eq('is_significant', true)
          .or(`organization_id.eq.${organizationId},organization_id.eq.${CORE_BRAIN_ORG_ID}`)
          .or(`source_domain.eq.${domain},target_domain.eq.${domain}`)
          .order('effect_size', { ascending: false })
          .limit(20),

        // Patterns for this domain
        supabase
          .from('brain_grammar_rules')
          .select('natural_language, confidence, rule_type, domain')
          .eq('is_active', true)
          .or(`organization_id.eq.${organizationId},organization_id.eq.${CORE_BRAIN_ORG_ID}`)
          .eq('domain', domain)
          .order('confidence', { ascending: false })
          .limit(10),

        // Memories for this domain
        supabase
          .from('ai_memory')
          .select('content, importance, memory_type')
          .or(`organization_id.eq.${organizationId},organization_id.eq.${CORE_BRAIN_ORG_ID}`)
          .eq('domain', domain)
          .order('importance', { ascending: false })
          .limit(5),
      ]);

      const causalEdges = causalResult.data || [];
      const causes = causalEdges.filter((e: any) => e.target_domain === domain);
      const effects = causalEdges.filter((e: any) => e.source_domain === domain);
      const relatedDomains = [...new Set([
        ...causes.map((e: any) => e.source_domain),
        ...effects.map((e: any) => e.target_domain),
      ])];

      return {
        domain,
        caused_by: causes.map((e: any) => ({
          domain: e.source_domain,
          effect_size: e.effect_size,
          lag_days: e.optimal_lag_days,
          description: e.natural_language,
          confounded: e.is_likely_confounded,
        })),
        causes_effects_on: effects.map((e: any) => ({
          domain: e.target_domain,
          effect_size: e.effect_size,
          lag_days: e.optimal_lag_days,
          description: e.natural_language,
          confounded: e.is_likely_confounded,
        })),
        related_domains: relatedDomains,
        patterns: (patternResult.data || []).map((p: any) => ({
          description: p.natural_language,
          confidence: p.confidence,
          type: p.rule_type,
        })),
        memories: (memoryResult.data || []).map((m: any) => ({
          content: m.content,
          importance: m.importance,
        })),
      };
    }

    // ── L7: INTELLIGENCE — Predict outcome ──
    case 'predict_outcome': {
      const source = toolInput.source_domain;
      const target = toolInput.target_domain;
      const direction = toolInput.change_direction;
      const magnitude = toolInput.change_magnitude || 0.5;

      // Find direct causal edge
      const { data: directEdge } = await supabase
        .from('causal_relationships_statistical')
        .select('effect_size, optimal_lag_days, natural_language, granger_p_value, confidence_interval_lower, confidence_interval_upper, is_likely_confounded, knockout_score, coefficient_sign')
        .or(`organization_id.eq.${organizationId},organization_id.eq.${CORE_BRAIN_ORG_ID}`)
        .eq('source_domain', source)
        .eq('target_domain', target)
        .eq('is_significant', true)
        .order('effect_size', { ascending: false })
        .limit(1);

      if (!directEdge || directEdge.length === 0) {
        // Check for indirect path (2-hop)
        const { data: allEdges } = await supabase
          .from('causal_relationships_statistical')
          .select('source_domain, target_domain, effect_size, optimal_lag_days, natural_language')
          .or(`organization_id.eq.${organizationId},organization_id.eq.${CORE_BRAIN_ORG_ID}`)
          .eq('is_significant', true)
          .eq('source_domain', source);

        const intermediates = (allEdges || []).filter((e: any) => e.target_domain !== target);
        for (const hop1 of intermediates) {
          const { data: hop2Edge } = await supabase
            .from('causal_relationships_statistical')
            .select('effect_size, optimal_lag_days, natural_language')
            .or(`organization_id.eq.${organizationId},organization_id.eq.${CORE_BRAIN_ORG_ID}`)
            .eq('source_domain', hop1.target_domain)
            .eq('target_domain', target)
            .eq('is_significant', true)
            .limit(1);

          if (hop2Edge && hop2Edge.length > 0) {
            const combinedEffect = hop1.effect_size * hop2Edge[0].effect_size;
            const combinedLag = (hop1.optimal_lag_days || 0) + (hop2Edge[0].optimal_lag_days || 0);
            return {
              prediction: {
                direction: (direction === 'increase' && combinedEffect > 0) || (direction === 'decrease' && combinedEffect < 0) ? 'increase' : 'decrease',
                magnitude: Math.abs(combinedEffect * magnitude),
                timeline_days: combinedLag,
                confidence: 'low',
                path: `${source} → ${hop1.target_domain} → ${target}`,
                is_indirect: true,
              },
              evidence: {
                hop1: { edge: `${source} → ${hop1.target_domain}`, effect: hop1.effect_size, description: hop1.natural_language },
                hop2: { edge: `${hop1.target_domain} → ${target}`, effect: hop2Edge[0].effect_size, description: hop2Edge[0].natural_language },
              },
            };
          }
        }

        return {
          prediction: null,
          reason: `No causal relationship found between ${source} and ${target} (direct or 2-hop indirect). The brain has not discovered a statistically significant link.`,
          suggestion: 'More signal data may be needed to discover this relationship. Try ingesting more signals from both domains.',
        };
      }

      const edge = directEdge[0];
      const coeffSign = edge.coefficient_sign ?? (edge.effect_size > 0 ? 1 : -1);
      const predictedDirection = (direction === 'increase' ? coeffSign > 0 : coeffSign < 0) ? 'increase' : 'decrease';
      const confounded = edge.is_likely_confounded ? 'WARNING: This relationship may be confounded — treat prediction with caution.' : null;

      return {
        prediction: {
          direction: predictedDirection,
          magnitude: Math.abs(edge.effect_size * magnitude),
          timeline_days: edge.optimal_lag_days || 0,
          confidence: edge.knockout_score > 0.3 ? 'high' : edge.granger_p_value < 0.01 ? 'medium' : 'low',
          is_direct: true,
          confounded_warning: confounded,
        },
        evidence: {
          effect_size: edge.effect_size,
          p_value: edge.granger_p_value,
          confidence_interval: edge.confidence_interval_lower != null
            ? [edge.confidence_interval_lower, edge.confidence_interval_upper]
            : null,
          knockout_score: edge.knockout_score,
          description: edge.natural_language,
        },
      };
    }

    // ── L1: INGESTION ──
    case 'ingest_signals': {
      const signals = toolInput.signals || [];
      if (signals.length === 0) return { success: true, signalsIngested: 0 };

      const now = new Date().toISOString();
      const signalRecords = signals.map((s: any) => ({
        organization_id: organizationId,
        source_domain: s.source_domain,
        signal_type: s.signal_type,
        signal_value: s.signal_value,
        signal_timestamp: now,
        entity_type: 'copilot_ingested',
        entity_id: `copilot_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        feature_vector: {},
        signal_metadata: { ingested_by: 'copilot_v2' },
        lookback_window_days: 30,
      }));

      const { data, error } = await supabase
        .from('cross_domain_signals')
        .insert(signalRecords)
        .select('id');

      if (error) return { success: false, error: error.message };
      return { success: true, signalsIngested: data?.length || 0 };
    }

    // ── EXPERTISE: Query contributor expertise graph ──
    case 'query_expertise': {
      const topic = toolInput.topic;
      const limit = toolInput.limit || 5;
      const minStrength = toolInput.min_strength || 0.1;

      // Query expertise from the contributor_expertise table
      // Use fuzzy topic matching: ILIKE with wildcards
      const topicPattern = `%${topic.toLowerCase()}%`;

      const { data: expertise, error: expError } = await supabase
        .from('contributor_expertise')
        .select('contributor_id, contributor_name, topic, evidence_type, strength, evidence_count, last_activity_at')
        .eq('organization_id', organizationId)
        .ilike('topic', topicPattern)
        .gte('strength', minStrength)
        .order('strength', { ascending: false })
        .limit(limit * 3); // Fetch more to aggregate across evidence types

      if (expError) return { error: expError.message };

      // Aggregate expertise by contributor (combine across evidence types)
      const contributorMap = new Map<string, {
        contributorId: string;
        contributorName: string;
        topics: string[];
        totalStrength: number;
        evidenceTypes: string[];
        totalEvidence: number;
        lastActivity: string;
      }>();

      for (const row of expertise || []) {
        const existing = contributorMap.get(row.contributor_id);
        if (existing) {
          existing.totalStrength = Math.max(existing.totalStrength, row.strength);
          if (!existing.topics.includes(row.topic)) existing.topics.push(row.topic);
          if (!existing.evidenceTypes.includes(row.evidence_type)) existing.evidenceTypes.push(row.evidence_type);
          existing.totalEvidence += row.evidence_count;
          if (row.last_activity_at > existing.lastActivity) existing.lastActivity = row.last_activity_at;
        } else {
          contributorMap.set(row.contributor_id, {
            contributorId: row.contributor_id,
            contributorName: row.contributor_name || row.contributor_id,
            topics: [row.topic],
            totalStrength: row.strength,
            evidenceTypes: [row.evidence_type],
            totalEvidence: row.evidence_count,
            lastActivity: row.last_activity_at,
          });
        }
      }

      // Sort by strength and return top N
      const experts = Array.from(contributorMap.values())
        .sort((a, b) => b.totalStrength - a.totalStrength)
        .slice(0, limit);

      return {
        topic,
        experts: experts.map(e => ({
          contributor: e.contributorName,
          contributorId: e.contributorId,
          strength: Math.round(e.totalStrength * 100) / 100,
          matchedTopics: e.topics,
          evidenceTypes: e.evidenceTypes,
          totalEvidence: e.totalEvidence,
          lastActive: e.lastActivity,
        })),
        totalMatches: contributorMap.size,
      };
    }

    // ── CODE CONTEXT: Search code knowledge in brain memory ──
    case 'query_code_context': {
      const query = toolInput.query;
      const domain = toolInput.domain || 'engineering';
      const limit = toolInput.limit || 10;

      // Search entity_embeddings for code-related entities
      const { data: entities, error: entError } = await supabase
        .from('entity_embeddings')
        .select('entity_type, entity_id, display_name, metadata')
        .eq('organization_id', organizationId)
        .or(`entity_type.eq.code_symbol,entity_type.eq.service,entity_type.eq.component`)
        .ilike('display_name', `%${query}%`)
        .limit(limit);

      // Also search ai_memory for technical knowledge
      const { data: memories, error: memError } = await supabase
        .from('ai_memory')
        .select('content, memory_type, importance, metadata')
        .eq('organization_id', organizationId)
        .or(`memory_type.eq.discovered_pattern,memory_type.eq.temporal_rule,memory_type.eq.brain_discovery,memory_type.eq.consolidation_report`)
        .ilike('content', `%${query}%`)
        .order('importance', { ascending: false })
        .limit(limit);

      return {
        query,
        codeEntities: (entities || []).map(e => ({
          type: e.entity_type,
          name: e.display_name || e.entity_id,
          metadata: e.metadata,
        })),
        knowledgeMatches: (memories || []).map(m => ({
          content: m.content,
          type: m.memory_type,
          importance: m.importance,
        })),
        totalResults: (entities?.length || 0) + (memories?.length || 0),
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ============================================================================
// SELF-CORRECTION: Check if answer contradicts causal evidence
// ============================================================================

/**
 * Build a self-correction check prompt.
 * After the initial answer, we check if any claims contradict
 * the causal graph evidence.
 */
function buildSelfCorrectionCheck(
  answer: string,
  causalContext: any[],
): string | null {
  if (causalContext.length === 0) return null;

  const edgeSummary = causalContext
    .slice(0, 10)
    .map((r: any) => `${r.source_domain} → ${r.target_domain} (effect: ${r.effect_size}, p=${r.granger_p_value})`)
    .join('\n');

  return `Review your answer for factual accuracy against the brain's causal evidence.

Your answer: "${answer.substring(0, 500)}..."

Known causal relationships:
${edgeSummary}

If your answer contains any claims that CONTRADICT these established causal relationships, issue a correction. If your answer is consistent, respond with "VERIFIED: Answer is consistent with causal evidence."`;
}

// ============================================================================
// FAST PATH — Context-enriched single LLM call (for simple queries)
// ============================================================================

async function handleFastPath(
  query: string,
  domain: string | undefined,
  supabase: SupabaseClient,
  organizationId: string,
  anthropicKey: string,
): Promise<Response> {
  const isCoreBrain = organizationId === CORE_BRAIN_ORG_ID;

  // Fetch all context in parallel (same as current nexus-query)
  const [
    { data: orgRels },
    { data: coreRels },
    { data: orgRules },
    { data: coreRules },
    { data: orgMems },
    { data: coreMems },
  ] = await Promise.all([
    supabase.from('causal_relationships_statistical').select('*')
      .eq('organization_id', organizationId).eq('is_significant', true)
      .order('effect_size', { ascending: false }).limit(10),
    isCoreBrain ? Promise.resolve({ data: [] }) :
      supabase.from('causal_relationships_statistical').select('*')
        .eq('organization_id', CORE_BRAIN_ORG_ID).eq('is_significant', true)
        .order('effect_size', { ascending: false }).limit(10),
    supabase.from('brain_grammar_rules').select('*')
      .eq('organization_id', organizationId).eq('is_active', true)
      .order('confidence', { ascending: false }).limit(10),
    isCoreBrain ? Promise.resolve({ data: [] }) :
      supabase.from('brain_grammar_rules').select('*')
        .eq('organization_id', CORE_BRAIN_ORG_ID).eq('is_active', true)
        .order('confidence', { ascending: false }).limit(10),
    supabase.from('ai_memory').select('*')
      .eq('organization_id', organizationId).order('importance', { ascending: false }).limit(5),
    isCoreBrain ? Promise.resolve({ data: [] }) :
      supabase.from('ai_memory').select('*')
        .eq('organization_id', CORE_BRAIN_ORG_ID).order('importance', { ascending: false }).limit(5),
  ]);

  // Merge + dedup (org priority)
  const orgRelsList = orgRels || [];
  const orgRelKeys = new Set(orgRelsList.map((r: any) => `${r.source_domain}::${r.target_domain}`));
  const uniqueCoreRels = (coreRels || []).filter((r: any) => !orgRelKeys.has(`${r.source_domain}::${r.target_domain}`));

  const orgRulesList = orgRules || [];
  const orgRuleKeys = new Set(orgRulesList.map((r: any) => `${r.domain}::${r.rule_type}::${(r.natural_language || '').substring(0, 50)}`));
  const uniqueCoreRules = (coreRules || []).filter((r: any) => !orgRuleKeys.has(`${r.domain}::${r.rule_type}::${(r.natural_language || '').substring(0, 50)}`));

  const orgMemsList = orgMems || [];
  const orgMemKeys = new Set(orgMemsList.map((m: any) => (m.content || '').substring(0, 80)));
  const uniqueCoreMems = (coreMems || []).filter((m: any) => !orgMemKeys.has((m.content || '').substring(0, 80)));

  // Build prompt
  const sections: string[] = [];
  sections.push('You are Nexus AI, an organizational intelligence copilot with access to real-time causal intelligence.');

  const formatRels = (rels: any[]) => rels.map((r: any) => `- ${r.source_domain} → ${r.target_domain}: effect ${r.effect_size} (p=${r.granger_p_value})`).join('\n');
  const formatRules = (rules: any[]) => rules.map((r: any) => `- [${Math.round((r.confidence || 0) * 100)}%] ${r.natural_language || r.rule_type}`).join('\n');
  const formatMems = (mems: any[]) => mems.map((m: any) => `- ${m.content}`).join('\n');

  if (orgRelsList.length > 0) sections.push(`## Your Organization's Causal Relationships\n${formatRels(orgRelsList)}`);
  if (uniqueCoreRels.length > 0) sections.push(`## Universal Knowledge (Core Brain)\n${formatRels(uniqueCoreRels)}`);
  if (orgRulesList.length > 0) sections.push(`## Org Patterns\n${formatRules(orgRulesList)}`);
  if (uniqueCoreRules.length > 0) sections.push(`## Universal Patterns\n${formatRules(uniqueCoreRules)}`);
  if (orgMemsList.length > 0) sections.push(`## Org Memory\n${formatMems(orgMemsList)}`);
  if (uniqueCoreMems.length > 0) sections.push(`## General Intelligence\n${formatMems(uniqueCoreMems)}`);
  sections.push('Be concise and strategic. Cite causal evidence when relevant.');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: MAX_TOKENS_FAST,
      system: sections.join('\n\n'),
      messages: [{ role: 'user', content: query }],
    }),
  });

  const llmData = await response.json();
  const answer = llmData.content?.[0]?.text || 'Unable to generate response';
  const tokensUsed = (llmData.usage?.input_tokens || 0) + (llmData.usage?.output_tokens || 0);

  return new Response(
    JSON.stringify({
      answer,
      path: 'fast',
      toolCalls: [],
      context: {
        causal: [...orgRelsList.map((r: any) => ({ ...r, _source: 'org' })), ...uniqueCoreRels.map((r: any) => ({ ...r, _source: 'core' }))],
        patterns: [...orgRulesList.map((r: any) => ({ ...r, _source: 'org' })), ...uniqueCoreRules.map((r: any) => ({ ...r, _source: 'core' }))],
        memories: [...orgMemsList.map((m: any) => ({ ...m, _source: 'org' })), ...uniqueCoreMems.map((m: any) => ({ ...m, _source: 'core' }))],
      },
      meta: {
        model: 'claude-sonnet-4-20250514',
        tokensUsed,
        complexity: 'simple',
        federated: !isCoreBrain,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ============================================================================
// AGENTIC PATH — Multi-turn tool-calling loop with SSE streaming
// ============================================================================

async function handleAgenticPath(
  query: string,
  domain: string | undefined,
  complexity: ComplexityAssessment,
  supabase: SupabaseClient,
  organizationId: string,
  anthropicKey: string,
  stream: boolean,
): Promise<Response> {
  const isCoreBrain = organizationId === CORE_BRAIN_ORG_ID;

  // Build system prompt with 7-layer awareness
  const systemPrompt = `You are Nexus AI, an organizational intelligence copilot with access to a live causal brain.

## Your Brain Architecture (7 Layers)
You have tool access to query each layer of the brain:

L1 INGESTION → ingest_signals: Feed new business signals for causal analysis
L3 SEMANTIC MEMORY → search_memory: Search organizational knowledge (RAG)
L4 CAUSAL ENGINE → query_causal_graph: Query cause-effect relationships with statistical evidence
                  → trace_cascade: Follow cause-effect chains across domains
L5 PATTERN MEMORY → query_patterns: Query learned organizational patterns
L6 DOMAIN AGENTS → get_domain_context: Get comprehensive domain intelligence
L7 INTELLIGENCE → predict_outcome: Predict effects of changes using causal graph

## Knowledge Federation
Every query federates TWO knowledge sources:
- **Org Brain**: This organization's proprietary discoveries (tagged _source: "org")
- **Core Brain**: Universal cross-industry intelligence trained on Wikipedia, FRED, IMF, World Bank, GitHub (tagged _source: "core")
Org-specific knowledge ALWAYS takes priority when both exist for the same relationship.

## How to Use Tools
1. Start by understanding what the user needs
2. Use the appropriate tools to gather evidence from the brain
3. Cross-reference org-specific knowledge with universal knowledge
4. Synthesize findings with statistical evidence (cite p-values, effect sizes, lag days)
5. Distinguish between VALIDATED causal relationships and correlations
6. When uncertain, explicitly state what data would improve confidence

## Response Quality
- Always ground claims in causal evidence from the brain
- Cite specific relationships: "engineering → cs (effect: 0.34, p=0.002, 14d lag)"
- Distinguish org-specific discoveries from universal knowledge
- Flag confounded relationships with appropriate caveats
- Provide actionable recommendations with expected timelines based on lag days
${domain ? `\nFocus domain: ${domain}` : ''}
Complexity assessment: ${complexity.level} (score: ${complexity.score}, signals: ${complexity.reasons.join(', ')})`;

  // Track all tool calls for the response
  const allToolCalls: Array<{ tool: string; input: any; output: any }> = [];

  if (stream) {
    // ── SSE STREAMING PATH ──
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // Send complexity assessment
          send('complexity', {
            level: complexity.level,
            score: complexity.score,
            reasons: complexity.reasons,
            suggestedTools: complexity.suggestedTools,
          });

          // Agentic loop
          let messages: Array<{ role: string; content: any }> = [
            { role: 'user', content: query },
          ];

          let finalAnswer = '';
          let totalTokens = 0;

          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            send('thinking', { round: round + 1, status: 'calling_claude' });

            // Call Claude with tools
            const llmResponse = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: MAX_TOKENS_AGENTIC,
                system: systemPrompt,
                tools: COPILOT_TOOLS,
                messages,
              }),
            });

            const llmData = await llmResponse.json();
            totalTokens += (llmData.usage?.input_tokens || 0) + (llmData.usage?.output_tokens || 0);

            if (llmData.error) {
              send('error', { message: llmData.error.message || 'LLM error' });
              break;
            }

            const contentBlocks = llmData.content || [];
            const stopReason = llmData.stop_reason;

            // Process content blocks
            const toolUseBlocks: any[] = [];
            for (const block of contentBlocks) {
              if (block.type === 'text' && block.text) {
                if (stopReason === 'end_turn') {
                  finalAnswer += block.text;
                  send('answer_chunk', { text: block.text });
                } else {
                  send('thinking_text', { text: block.text });
                }
              } else if (block.type === 'tool_use') {
                toolUseBlocks.push(block);
              }
            }

            // If Claude is done (no tool calls), break
            if (stopReason === 'end_turn' || toolUseBlocks.length === 0) {
              break;
            }

            // Execute tool calls and feed results back
            messages.push({ role: 'assistant', content: contentBlocks });

            const toolResults: any[] = [];
            for (const toolBlock of toolUseBlocks) {
              send('tool_call', {
                tool: toolBlock.name,
                input: toolBlock.input,
                round: round + 1,
              });

              const result = await executeTool(
                toolBlock.name,
                toolBlock.input,
                supabase,
                organizationId,
              );

              allToolCalls.push({
                tool: toolBlock.name,
                input: toolBlock.input,
                output: result,
              });

              send('tool_result', {
                tool: toolBlock.name,
                result_summary: summarizeToolResult(toolBlock.name, result),
              });

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolBlock.id,
                content: JSON.stringify(result),
              });
            }

            messages.push({ role: 'user', content: toolResults });
          }

          // ── SELF-CORRECTION CHECK ──
          if (finalAnswer && allToolCalls.length > 0) {
            const causalToolCall = allToolCalls.find(tc => tc.tool === 'query_causal_graph');
            if (causalToolCall?.output?.relationships?.length > 0) {
              const correctionPrompt = buildSelfCorrectionCheck(
                finalAnswer,
                causalToolCall.output.relationships,
              );
              if (correctionPrompt) {
                send('thinking', { round: 'self_correction', status: 'verifying_against_evidence' });

                const correctionResponse = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 512,
                    messages: [{ role: 'user', content: correctionPrompt }],
                  }),
                });

                const correctionData = await correctionResponse.json();
                totalTokens += (correctionData.usage?.input_tokens || 0) + (correctionData.usage?.output_tokens || 0);
                const correctionText = correctionData.content?.[0]?.text || '';

                if (!correctionText.includes('VERIFIED')) {
                  send('self_correction', { correction: correctionText });
                  finalAnswer += `\n\n---\n**Self-correction:** ${correctionText}`;
                } else {
                  send('self_correction', { status: 'verified', message: 'Answer consistent with causal evidence' });
                }
              }
            }
          }

          // Send final complete event
          send('done', {
            answer: finalAnswer,
            toolCallsCount: allToolCalls.length,
            tokensUsed: totalTokens,
            complexity: complexity.level,
            federated: !isCoreBrain,
          });
        } catch (error: any) {
          send('error', { message: error.message || 'Unknown error' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } else {
    // ── NON-STREAMING (JSON) PATH ──
    let messages: Array<{ role: string; content: any }> = [
      { role: 'user', content: query },
    ];

    let finalAnswer = '';
    let totalTokens = 0;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const llmResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: MAX_TOKENS_AGENTIC,
          system: systemPrompt,
          tools: COPILOT_TOOLS,
          messages,
        }),
      });

      const llmData = await llmResponse.json();
      totalTokens += (llmData.usage?.input_tokens || 0) + (llmData.usage?.output_tokens || 0);

      if (llmData.error) {
        return new Response(
          JSON.stringify({ error: llmData.error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const contentBlocks = llmData.content || [];
      const stopReason = llmData.stop_reason;

      // Collect text and tool_use blocks
      const toolUseBlocks: any[] = [];
      for (const block of contentBlocks) {
        if (block.type === 'text' && block.text) {
          finalAnswer += block.text;
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
        }
      }

      // If done
      if (stopReason === 'end_turn' || toolUseBlocks.length === 0) {
        break;
      }

      // Execute tools
      messages.push({ role: 'assistant', content: contentBlocks });

      const toolResults: any[] = [];
      for (const toolBlock of toolUseBlocks) {
        const result = await executeTool(
          toolBlock.name,
          toolBlock.input,
          supabase,
          organizationId,
        );

        allToolCalls.push({
          tool: toolBlock.name,
          input: toolBlock.input,
          output: result,
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    // ── SELF-CORRECTION ──
    let selfCorrectionResult: any = null;
    if (finalAnswer && allToolCalls.length > 0) {
      const causalToolCall = allToolCalls.find(tc => tc.tool === 'query_causal_graph');
      if (causalToolCall?.output?.relationships?.length > 0) {
        const correctionPrompt = buildSelfCorrectionCheck(
          finalAnswer,
          causalToolCall.output.relationships,
        );
        if (correctionPrompt) {
          const correctionResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 512,
              messages: [{ role: 'user', content: correctionPrompt }],
            }),
          });

          const correctionData = await correctionResponse.json();
          totalTokens += (correctionData.usage?.input_tokens || 0) + (correctionData.usage?.output_tokens || 0);
          const correctionText = correctionData.content?.[0]?.text || '';

          if (!correctionText.includes('VERIFIED')) {
            selfCorrectionResult = { corrected: true, correction: correctionText };
            finalAnswer += `\n\n---\n**Self-correction:** ${correctionText}`;
          } else {
            selfCorrectionResult = { corrected: false, status: 'verified' };
          }
        }
      }
    }

    // Log activity
    await supabase.from('ai_agent_activity').insert({
      organization_id: organizationId,
      agent_type: 'copilot_v2',
      action_type: 'agentic_query',
      input_summary: query.substring(0, 200),
      output_summary: finalAnswer.substring(0, 200),
      tokens_used: totalTokens,
      metadata: {
        domain,
        complexity: complexity.level,
        complexityScore: complexity.score,
        toolCallsCount: allToolCalls.length,
        toolsUsed: [...new Set(allToolCalls.map(tc => tc.tool))],
        selfCorrected: selfCorrectionResult?.corrected || false,
        federated: !isCoreBrain,
      },
    }).catch(() => { /* non-critical */ });

    return new Response(
      JSON.stringify({
        answer: finalAnswer,
        path: 'agentic',
        complexity: {
          level: complexity.level,
          score: complexity.score,
          reasons: complexity.reasons,
        },
        toolCalls: allToolCalls.map(tc => ({
          tool: tc.tool,
          input: tc.input,
          result_summary: summarizeToolResult(tc.tool, tc.output),
        })),
        selfCorrection: selfCorrectionResult,
        meta: {
          model: 'claude-sonnet-4-20250514',
          tokensUsed: totalTokens,
          toolCallsCount: allToolCalls.length,
          toolsUsed: [...new Set(allToolCalls.map(tc => tc.tool))],
          agenticRounds: allToolCalls.length > 0 ? Math.ceil(allToolCalls.length / 3) : 0,
          federated: !isCoreBrain,
          layersAccessed: getLayersAccessed(allToolCalls),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Summarize a tool result for concise reporting
 */
function summarizeToolResult(toolName: string, result: any): string {
  switch (toolName) {
    case 'search_memory':
      return `Found ${result.memories?.length || 0} memories (${result.sources?.org || 0} org, ${result.sources?.core || 0} core)`;
    case 'query_causal_graph':
      return `Found ${result.count || 0} causal relationships (${result.org_count || 0} org, ${result.core_count || 0} core)`;
    case 'trace_cascade':
      return result.summary || `Cascade traced: ${result.total_domains_affected || 0} domains affected`;
    case 'query_patterns':
      return `Found ${(result.patterns?.length || 0)} patterns (${result.org_count || 0} org, ${result.core_count || 0} core)`;
    case 'get_domain_context':
      return `Domain ${result.domain}: ${result.caused_by?.length || 0} causes, ${result.causes_effects_on?.length || 0} effects, ${result.related_domains?.length || 0} related`;
    case 'predict_outcome':
      return result.prediction
        ? `Prediction: ${result.prediction.direction} (magnitude: ${result.prediction.magnitude?.toFixed(3)}, timeline: ${result.prediction.timeline_days}d, confidence: ${result.prediction.confidence})`
        : result.reason || 'No prediction available';
    case 'ingest_signals':
      return `Ingested ${result.signalsIngested || 0} signals`;
    default:
      return JSON.stringify(result).substring(0, 200);
  }
}

/**
 * Map tool calls to brain layers accessed
 */
function getLayersAccessed(toolCalls: Array<{ tool: string }>): string[] {
  const layerMap: Record<string, string> = {
    ingest_signals: 'L1_Ingestion',
    search_memory: 'L3_SemanticMemory',
    query_causal_graph: 'L4_CausalEngine',
    trace_cascade: 'L4_CausalEngine',
    query_patterns: 'L5_PatternMemory',
    get_domain_context: 'L6_DomainAgents',
    predict_outcome: 'L7_Intelligence',
  };

  return [...new Set(toolCalls.map(tc => layerMap[tc.tool]).filter(Boolean))];
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { organizationId, query, domain, conversationId, stream = false } = await req.json();

    if (!organizationId || !query) {
      return new Response(
        JSON.stringify({ error: 'organizationId and query are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── CEREBELLUM CHECK (pre-compiled fast-path cache) ──
    // Brain Analog: Before conscious thought, check if the Cerebellum has
    // a pre-compiled motor program for this query shape.
    const fingerprint = fingerprintQuery(query);
    const cached = await cerebellumLookup(supabase, organizationId, fingerprint);

    if (cached) {
      // Cerebellum HIT — use pre-compiled context, skip complexity assessment
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: MAX_TOKENS_FAST,
          system: cached.compiledContext,
          messages: [{ role: 'user', content: query }],
        }),
      });

      const llmData = await response.json();
      const answer = llmData.content?.[0]?.text || 'Unable to generate response';
      const tokensUsed = (llmData.usage?.input_tokens || 0) + (llmData.usage?.output_tokens || 0);

      return new Response(
        JSON.stringify({
          answer,
          path: 'cerebellum',
          toolCalls: [],
          context: { cachedEdges: cached.relevantEdges },
          meta: {
            model: 'claude-sonnet-4-20250514',
            tokensUsed,
            complexity: 'cached',
            fingerprint: fingerprint.hash,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── COMPLEXITY ROUTER ──
    const complexity = assessComplexity(query, domain);

    // Simple queries → fast path (context + single LLM call)
    // Moderate/Complex queries → agentic path (Claude + tools + loop)
    if (complexity.level === 'simple') {
      // After fast-path response, record the compiled context for future Cerebellum use
      const resp = await handleFastPath(query, domain, supabase, organizationId, anthropicKey);

      // Clone response to read body, then re-serve
      const body = await resp.clone().json();
      if (body.answer && body.context?.causal) {
        // Build compiled context from the sections that were used
        const sections: string[] = ['You are Nexus AI, an organizational intelligence copilot with access to real-time causal intelligence.'];
        if (body.context.causal?.length) {
          sections.push('## Causal Relationships\n' + body.context.causal.map((r: any) => `- ${r.source_domain} → ${r.target_domain}: effect ${r.effect_size}`).join('\n'));
        }
        sections.push('Be concise and strategic. Cite causal evidence when relevant.');
        cerebellumRecord(supabase, organizationId, fingerprint, sections.join('\n\n'), body.context.causal || []);
      }

      return resp;
    } else {
      return handleAgenticPath(query, domain, complexity, supabase, organizationId, anthropicKey, stream);
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
