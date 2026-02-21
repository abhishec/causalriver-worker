/**
 * Unified Brain Orchestrator
 *
 * Intelligent routing across all 7 cognitive domains + 8 SE-aaS domains
 * Uses Claude for query understanding and confidence scoring
 *
 *
 * @module lib/brain/orchestrator
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { MODEL_DEEP } from '@nexus-ai/memory-stack';
import { logger } from "@/lib/logger";

export interface BrainQueryRequest {
  query: string;
  context?: {
    organizationId: string;
    timeRange?: string;
    includeSeaas?: boolean;
    includeCognitive?: boolean;
  };
  anthropicApiKey?: string;
}

export interface DomainRoute {
  domain: string;
  confidence: number;
  reasoning: string;
  parameters?: Record<string, unknown>;
}

export interface BrainQueryResponse {
  query: string;
  routes: DomainRoute[];
  unifiedAnswer: string;
  confidence: number;
  domainResults: Array<{
    domain: string;
    result: any;
    executionTime: number;
  }>;
  metadata: {
    totalExecutionTime: number;
    domainsQueried: number;
    claudePowered: boolean;
  };
}

/**
 * Available domains for routing
 */
const COGNITIVE_DOMAINS = [
  'pattern-detection',
  'forecaster',
  'causal-reasoner',
  'anomaly-detector',
  'simulator',
  'optimizer',
  'narrative-generator',
] as const;

const SE_AAS_DOMAINS = [
  'test-case-generator',
  'sql-analyzer',
  'test-data-generator',
  'tdd-code-generator',
  'incident-diagnosis',
  'impact-analysis',
  'data-lineage',
  'log-query',
] as const;

/**
 * Intelligent query router using Claude
 */
export async function routeQuery(
  request: BrainQueryRequest
): Promise<DomainRoute[]> {
  const { query, context, anthropicApiKey } = request;

  if (!anthropicApiKey) {
    // Fallback: heuristic routing
    return routeQueryHeuristic(query, context);
  }

  // Claude-powered intelligent routing
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  const prompt = `You are an intelligent query router for the NexusBrain platform. Your job is to analyze user queries and route them to the appropriate domains.

Available Cognitive Domains:
- pattern-detection: Finds recurring patterns in time-series data
- forecaster: Predicts future values based on historical data
- causal-reasoner: Identifies causal relationships between metrics
- anomaly-detector: Detects anomalies and outliers
- simulator: Simulates what-if scenarios
- optimizer: Recommends optimal thresholds and configurations
- narrative-generator: Generates human-readable explanations

Available SE-aaS Domains:
- test-case-generator: Generates unit/integration test cases
- sql-analyzer: Analyzes SQL queries for performance and security
- test-data-generator: Creates synthetic test data
- tdd-code-generator: Guides TDD (Red-Green-Refactor) workflow
- incident-diagnosis: Diagnoses production incidents
- impact-analysis: Analyzes code change impact
- data-lineage: Maps data model relationships
- log-query: Analyzes log patterns and errors

User Query: "${query}"
Context: ${JSON.stringify(context || {})}

Analyze this query and return a JSON array of domain routes with confidence scores (0-1).
Each route should have: domain, confidence, reasoning, parameters (optional).

Example response:
[
  {
    "domain": "incident-diagnosis",
    "confidence": 0.95,
    "reasoning": "Query mentions 'spike in errors' which indicates a production incident",
    "parameters": { "timeRange": "24h" }
  },
  {
    "domain": "log-query",
    "confidence": 0.85,
    "reasoning": "Will need to analyze logs to find error patterns",
    "parameters": { "pattern": "error" }
  }
]

Return ONLY the JSON array, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL_DEEP,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      const routes = JSON.parse(content.text);
      return routes.sort((a: DomainRoute, b: DomainRoute) => b.confidence - a.confidence);
    }
  } catch (error) {
    logger.error('Claude routing failed, falling back to heuristic:', error);
    return routeQueryHeuristic(query, context);
  }

  return routeQueryHeuristic(query, context);
}

/**
 * Heuristic-based routing (fallback)
 */
function routeQueryHeuristic(
  query: string,
  context?: BrainQueryRequest['context']
): DomainRoute[] {
  const routes: DomainRoute[] = [];
  const lowerQuery = query.toLowerCase();

  // SE-aaS domain patterns
  if (lowerQuery.includes('test') && lowerQuery.includes('case')) {
    routes.push({
      domain: 'test-case-generator',
      confidence: 0.8,
      reasoning: 'Query mentions test cases',
    });
  }

  if (lowerQuery.includes('sql') || lowerQuery.includes('query') && lowerQuery.includes('database')) {
    routes.push({
      domain: 'sql-analyzer',
      confidence: 0.75,
      reasoning: 'Query mentions SQL or database queries',
    });
  }

  if (lowerQuery.includes('incident') || lowerQuery.includes('error') || lowerQuery.includes('bug')) {
    routes.push({
      domain: 'incident-diagnosis',
      confidence: 0.85,
      reasoning: 'Query mentions incidents, errors, or bugs',
      parameters: { timeRange: context?.timeRange || '24h' },
    });
  }

  if (lowerQuery.includes('impact') || lowerQuery.includes('change')) {
    routes.push({
      domain: 'impact-analysis',
      confidence: 0.8,
      reasoning: 'Query mentions impact or changes',
    });
  }

  if (lowerQuery.includes('log')) {
    routes.push({
      domain: 'log-query',
      confidence: 0.75,
      reasoning: 'Query mentions logs',
      parameters: { timeRange: context?.timeRange || '24h' },
    });
  }

  // Cognitive domain patterns
  if (lowerQuery.includes('pattern') || lowerQuery.includes('trend')) {
    routes.push({
      domain: 'pattern-detection',
      confidence: 0.7,
      reasoning: 'Query asks about patterns or trends',
    });
  }

  if (lowerQuery.includes('predict') || lowerQuery.includes('forecast')) {
    routes.push({
      domain: 'forecaster',
      confidence: 0.8,
      reasoning: 'Query asks for predictions or forecasts',
    });
  }

  if (lowerQuery.includes('cause') || lowerQuery.includes('why')) {
    routes.push({
      domain: 'causal-reasoner',
      confidence: 0.75,
      reasoning: 'Query asks about causality',
    });
  }

  if (lowerQuery.includes('anomaly') || lowerQuery.includes('spike') || lowerQuery.includes('unusual')) {
    routes.push({
      domain: 'anomaly-detector',
      confidence: 0.8,
      reasoning: 'Query mentions anomalies or spikes',
    });
  }

  if (routes.length === 0) {
    // Default: route to pattern detection and narrative generator
    routes.push({
      domain: 'pattern-detection',
      confidence: 0.5,
      reasoning: 'Default routing for exploratory queries',
    });
  }

  return routes.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Execute unified brain query across multiple domains
 */
export async function executeUnifiedQuery(
  request: BrainQueryRequest
): Promise<BrainQueryResponse> {
  const startTime = Date.now();

  // Step 1: Route query to appropriate domains
  const routes = await routeQuery(request);

  // Step 2: Execute domains in parallel (top 3 by confidence)
  const topRoutes = routes.slice(0, 3);
  const domainResults: BrainQueryResponse['domainResults'] = [];

  // Create Supabase client for Brain context assembly
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const orgId = request.context?.organizationId;

  for (const route of topRoutes) {
    const domainStart = Date.now();
    try {
      let result: Record<string, unknown>;

      // Real domain execution: assemble Brain context + query real data
      if (supabaseUrl && supabaseKey && orgId) {
        const supabase = createSupabaseClient(supabaseUrl, supabaseKey);
        result = await executeDomainWithBrainContext(
          supabase as any, orgId, route, request.query, request.anthropicApiKey
        );
      } else {
        // Degraded mode: return routing result with explanation
        result = {
          domain: route.domain,
          success: true,
          data: {
            routed: true,
            confidence: route.confidence,
            reasoning: route.reasoning,
            message: `Query routed to ${route.domain}. Configure SUPABASE_SERVICE_ROLE_KEY for full Brain-augmented execution.`,
          },
        };
      }

      domainResults.push({
        domain: route.domain,
        result,
        executionTime: Date.now() - domainStart,
      });
    } catch (error) {
      domainResults.push({
        domain: route.domain,
        result: { success: false, error: (error as Error).message },
        executionTime: Date.now() - domainStart,
      });
    }
  }

  // Step 3: Synthesize unified answer
  const unifiedAnswer = await synthesizeAnswer(
    request.query,
    domainResults,
    request.anthropicApiKey
  );

  return {
    query: request.query,
    routes: topRoutes,
    unifiedAnswer,
    confidence: topRoutes[0]?.confidence || 0,
    domainResults,
    metadata: {
      totalExecutionTime: Date.now() - startTime,
      domainsQueried: topRoutes.length,
      claudePowered: !!request.anthropicApiKey,
    },
  };
}

/**
 * Synthesize unified answer from multiple domain results
 */
async function synthesizeAnswer(
  query: string,
  domainResults: BrainQueryResponse['domainResults'],
  anthropicApiKey?: string
): Promise<string> {
  if (!anthropicApiKey) {
    // Fallback: simple concatenation
    return domainResults
      .map(r => `${r.domain}: ${JSON.stringify(r.result)}`)
      .join('\n\n');
  }

  // Claude-powered synthesis
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  const prompt = `You are a synthesis agent for the NexusBrain platform. Your job is to combine results from multiple cognitive domains into a single, coherent answer.

User Query: "${query}"

Domain Results:
${JSON.stringify(domainResults, null, 2)}

Synthesize these results into a clear, actionable answer for the user. Focus on:
1. Direct answer to the user's question
2. Confidence level and reasoning
3. Actionable recommendations
4. Any caveats or limitations

Keep the response concise (2-4 paragraphs max).`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL_DEEP,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return content.text;
    }
  } catch (error) {
    logger.error('Claude synthesis failed:', error);
  }

  // Fallback
  return domainResults
    .map(r => `**${r.domain}**: ${JSON.stringify(r.result)}`)
    .join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Domain Execution with Brain Context ──────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a domain with REAL Brain context — causal edges, patterns,
 * velocity snapshots, bottleneck risk, recent signals.
 *
 * This is what makes NexusBrain different from "stateless Claude":
 * every query gets the full organizational intelligence context.
 */
async function executeDomainWithBrainContext(
  supabase: ReturnType<typeof createSupabaseClient>,
  organizationId: string,
  route: DomainRoute,
  query: string,
  anthropicApiKey?: string
): Promise<Record<string, unknown>> {
  // Assemble Brain context — the same 10-query parallel load used by SE-aaS
  const [
    causalEdgesRes,
    patternsRes,
    velocityRes,
    bottleneckRes,
    recentSignalsRes,
    brainInsightsRes,
  ] = await Promise.all([
    supabase
      .from('causal_relationships_statistical')
      .select('source_entity, target_entity, strength, confidence_score, lag_days, p_value, source_domain, target_domain, natural_language')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(30),
    supabase
      .from('brain_grammar_rules')
      .select('rule_name, rule_body, confidence, domain')
      .eq('organization_id', organizationId)
      .gte('confidence', 0.5)
      .limit(15),
    supabase
      .from('velocity_snapshots')
      .select('prs_merged, mean_pr_cycle_time_hours, open_pr_count, prs_per_engineer, snapshot_date')
      .eq('organization_id', organizationId)
      .order('snapshot_date', { ascending: false })
      .limit(5),
    supabase
      .from('bottleneck_snapshots')
      .select('bottleneck_risk_score, risk_level, reviewer_gini_coefficient, reviewer_hhi, top_reviewer_share')
      .eq('organization_id', organizationId)
      .order('snapshot_date', { ascending: false })
      .limit(1),
    supabase
      .from('cross_domain_signals')
      .select('signal_type, signal_value, signal_metadata, source_domain, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('ai_memory')
      .select('content, memory_type, cognitive_layer, created_at')
      .eq('organization_id', organizationId)
      .in('memory_type', ['insight', 'pattern', 'prediction', 'alert'])
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const brainContext = {
    causalEdges: causalEdgesRes.data || [],
    patterns: patternsRes.data || [],
    velocitySnapshots: velocityRes.data || [],
    bottleneck: bottleneckRes.data?.[0] || null,
    recentSignals: recentSignalsRes.data || [],
    brainInsights: brainInsightsRes.data || [],
  };

  // Build domain-specific intelligence from Brain context
  const domainIntelligence = buildDomainIntelligence(route.domain, brainContext, query);

  return {
    domain: route.domain,
    success: true,
    brainAugmented: true,
    data: {
      ...domainIntelligence,
      confidence: route.confidence,
      reasoning: route.reasoning,
      brainContext: {
        causalEdgesAvailable: brainContext.causalEdges.length,
        patternsAvailable: brainContext.patterns.length,
        recentSignals: brainContext.recentSignals.length,
        velocityData: brainContext.velocitySnapshots.length > 0,
        bottleneckData: !!brainContext.bottleneck,
      },
    },
  };
}

/**
 * Build domain-specific intelligence by filtering Brain context
 * to the most relevant causal edges, patterns, and signals.
 */
function buildDomainIntelligence(
  domain: string,
  brainContext: Record<string, any>,
  query: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Filter causal edges relevant to this domain
  const relevantEdges = brainContext.causalEdges.filter(
    (e: any) => e.source_domain === domain || e.target_domain === domain ||
      e.source_entity?.toLowerCase().includes(domain) ||
      e.target_entity?.toLowerCase().includes(domain)
  );
  result.relevantCausalEdges = relevantEdges.slice(0, 10).map((e: any) => ({
    relationship: e.natural_language || `${e.source_entity} → ${e.target_entity}`,
    strength: e.strength,
    confidence: e.confidence_score,
    lagDays: e.lag_days,
    pValue: e.p_value,
  }));

  // Filter patterns relevant to this domain
  result.relevantPatterns = brainContext.patterns
    .filter((p: any) => p.domain === domain || p.rule_name?.includes(domain))
    .slice(0, 5)
    .map((p: any) => ({ rule: p.rule_name, confidence: p.confidence }));

  // Domain-specific enrichment
  switch (domain) {
    case 'anomaly-detector':
    case 'pattern-detection':
      result.recentSignalSummary = summarizeSignals(brainContext.recentSignals);
      break;

    case 'forecaster':
      result.velocityTrend = brainContext.velocitySnapshots.map((v: any) => ({
        date: v.snapshot_date,
        prsMerged: v.prs_merged,
        cycleTime: v.mean_pr_cycle_time_hours,
      }));
      break;

    case 'causal-reasoner':
      result.allCausalEdges = brainContext.causalEdges.slice(0, 20).map((e: any) => ({
        relationship: e.natural_language || `${e.source_entity} → ${e.target_entity}`,
        strength: e.strength,
        confidence: e.confidence_score,
      }));
      break;

    case 'incident-diagnosis':
    case 'log-query':
      result.recentAlerts = brainContext.brainInsights
        .filter((i: any) => i.memory_type === 'alert')
        .map((i: any) => ({ content: i.content, layer: i.cognitive_layer, at: i.created_at }));
      result.bottleneckRisk = brainContext.bottleneck;
      break;

    case 'impact-analysis':
      result.bottleneckRisk = brainContext.bottleneck;
      result.velocityContext = brainContext.velocitySnapshots[0] || null;
      break;

    default:
      // For SE-aaS domains, provide full Brain context summary
      result.brainInsights = brainContext.brainInsights.slice(0, 5).map((i: any) => ({
        content: i.content,
        type: i.memory_type,
        layer: i.cognitive_layer,
      }));
      break;
  }

  return result;
}

/**
 * Summarize recent signals by type for anomaly/pattern detection
 */
function summarizeSignals(signals: any[]): Record<string, { count: number; latestValue: number }> {
  const summary: Record<string, { count: number; latestValue: number }> = {};
  for (const sig of signals) {
    const key = `${sig.source_domain}.${sig.signal_type}`;
    if (!summary[key]) {
      summary[key] = { count: 0, latestValue: sig.signal_value || 0 };
    }
    summary[key].count++;
  }
  return summary;
}
