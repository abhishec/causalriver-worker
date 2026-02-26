/**
 * LLM Query Interpreter — Phase 3: Semantic Query Understanding
 * ==============================================================
 *
 * Brain Analog: Wernicke's Area (Language Comprehension)
 *   — understands the MEANING of a query, not just its surface keywords
 *
 * THE INNOVATION: Replace regex dispatch with a single Haiku LLM call (~200ms)
 * that understands:
 *   1. Semantic intent (not just keyword matching)
 *   2. Multi-domain extraction with confidence scores
 *   3. Entity extraction (PR#456, JIRA-123, metric names, date ranges)
 *   4. Service routing (copilot vs SE-aaS vs AAS)
 *   5. Required data signals (what DB queries to actually run)
 *   6. Adaptive token budgets (query-specific, not static per-intent)
 *
 * Why this matters:
 *   - Prompt drops from 80K → 10-15K tokens (targeted retrieval)
 *   - 4-6 DB queries instead of 12 (skip what's not needed)
 *   - Handles ambiguous, multi-intent, multi-domain queries correctly
 *   - SINGLE module used by ALL services (Copilot, SE-aaS, AAS, marketplace)
 *   - Graceful fallback to regex dispatch-assessor on any failure
 *
 * @packageDocumentation
 */

import {
  createDispatchAssessor,
  type DispatchAssessment,
  type UserIntent,
  type BusinessDomain,
  type DispatchRoute,
  type ComplexityFactors,
} from './dispatch-assessor';
import type { TokenBudget, ServiceType } from './brain-context-mesh';
import { MODEL_FAST } from '../infra/smart-model-router';

// ============================================================================
// TYPES — Query Interpretation
// ============================================================================

/** Full semantic interpretation of a user query */
export interface QueryInterpretation {
  /** Semantic intent classification */
  intent: UserIntent;
  /** LLM self-reported confidence in classification (0-1) */
  confidence: number;
  /** Detected business domains, ordered by relevance */
  domains: BusinessDomain[];
  /** Primary domain */
  primaryDomain: BusinessDomain;

  /** Service routing decision (replaces regex detectSEaaSRoute + detectAccountingRoute) */
  serviceRoute: ServiceRouteDecision;

  /** Complexity assessment */
  complexity: {
    score: number;
    route: DispatchRoute;
    reasoning: string;
  };

  /** Extracted entities for targeted DB retrieval */
  entities: ExtractedEntity[];

  /** What data the brain should load (targeted retrieval flags) */
  requiredData: RequiredDataSignals;

  /** Adaptive token budget based on query semantics */
  tokenBudget: TokenBudget;

  /** Whether result came from LLM or regex fallback */
  source: 'llm' | 'regex-fallback';

  /** Interpretation latency in ms */
  latencyMs: number;
}

/** Spec for an agent to be created via Copilot */
export interface AgentSpec {
  name: string;
  description: string;
  domain: 'delivery-intelligence' | 'early-warning' | 'pod-match' | 'scope-creep' | 'custom';
  trigger: 'manual' | 'scheduled' | 'event';
  schedule?: string; // cron expression
  requiredInputs?: string[];
}

/** Service routing decision */
export interface ServiceRouteDecision {
  type: 'copilot' | 'se-aas' | 'aas' | 'create-agent' | 'general';
  /** SE-aaS domain to route to (e.g., 'sql-analyzer', 'test-case-generator') */
  seaasDomain?: string;
  /** Extracted input for SE-aaS domain execution */
  seaasInput?: Record<string, unknown>;
  /** AAS agent to route to (e.g., 'statement-generator', 'reconciler') */
  aasDomain?: string;
  /** Extracted input for AAS agent execution */
  aasInput?: Record<string, unknown>;
  /** Agent spec when type === 'create-agent' */
  agentSpec?: AgentSpec;
}

/** An entity extracted from the query */
export interface ExtractedEntity {
  type: 'pr' | 'jira_ticket' | 'person' | 'metric' | 'date_range' | 'code_ref' | 'account' | 'domain';
  value: string;
  raw: string;
}

/** Flags telling the brain which DB queries to run */
export interface RequiredDataSignals {
  needsCausalEdges: boolean;
  needsPatterns: boolean;
  needsCascadeRules: boolean;
  needsEntityLinks: boolean;
  needsVelocityData: boolean;
  needsBottleneckData: boolean;
  needsSignals: boolean;
  needsPredictions: boolean;
  needsEvolution: boolean;
  needsCorrections: boolean;
  needsAccountingPatterns: boolean;
  needsFinancialEdges: boolean;
  /** Domain filter for signals (e.g., 'engineering%') */
  signalDomainFilter?: string;
  /** Entity filter for targeted link lookup (e.g., 'PR#456') */
  entityLinkFilter?: string;
  /** Domain filter for causal edges (e.g., 'finance') */
  causalDomainFilter?: string;
}

// ============================================================================
// TYPES — Config & Instance
// ============================================================================

export interface LLMQueryInterpreterConfig {
  /** Anthropic API key */
  anthropicApiKey: string;
  /** Max latency before fallback (default: 500ms) */
  timeoutMs?: number;
  /** Enable in-memory LRU cache (default: true) */
  enableCache?: boolean;
  /** Max cache entries (default: 100) */
  maxCacheEntries?: number;
  /** Cache TTL in ms (default: 300000 = 5 minutes) */
  cacheTtlMs?: number;
}

export interface LLMQueryInterpreterInstance {
  /** Interpret a query using LLM (with regex fallback on failure) */
  interpret(query: string, context?: { serviceHint?: ServiceType }): Promise<QueryInterpretation>;
  /** Convert a QueryInterpretation to DispatchAssessment for backward compat */
  toDispatchAssessment(interpretation: QueryInterpretation): DispatchAssessment;
  /** Clear the interpretation cache */
  clearCache(): void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Haiku model for fast classification (~200ms) */
const HAIKU_MODEL = MODEL_FAST;

/** Valid SE-aaS domains */
const VALID_SEAAS_DOMAINS = new Set([
  'sql-analyzer', 'test-case-generator', 'test-data-generator', 'tdd-code-generator',
  'incident-diagnosis', 'impact-analysis', 'data-lineage', 'log-query',
  'dependency-upgrade', 'design-doc-generator', 'performance-profiler', 'dead-code-detector',
  'pr-review', 'boilerplate-scaffold', 'codebase-qa',
  // SE-aaS Delivery Intelligence domains — MUST match classifier prompt + chat route list
  'pod-match', 'early-warning', 'scope-creep', 'delivery-intelligence',
]);

/** Valid AAS domains */
const VALID_AAS_DOMAINS = new Set([
  'bookkeeper', 'reconciler', 'statement-generator', 'tax-compliance',
  'audit-preparer', 'anomaly-detective', 'causal-accountant',
]);

/** Valid intents */
const VALID_INTENTS = new Set<UserIntent>([
  'lookup', 'explain', 'predict', 'simulate', 'diagnose', 'build',
  'compare', 'monitor', 'optimize', 'recommend', 'audit', 'general',
]);

/** Valid domains */
const VALID_DOMAINS = new Set<BusinessDomain>([
  'finance', 'growth', 'cs', 'marketing', 'product', 'strategy',
  'engineering', 'people', 'revenue', 'operations', 'compliance',
]);

/** Valid routes */
const VALID_ROUTES = new Set<DispatchRoute>(['fast_query', 'action_domain', 'agent_orchestration']);

// ============================================================================
// LLM PROMPT — Compact (~800 tokens) for fast Haiku classification
// ============================================================================

const CLASSIFIER_SYSTEM_PROMPT = `You are NexusBrain's query classifier. Given a user query, classify it and output ONLY a JSON object (no markdown, no explanation).

## Available Services
SE-aaS domains: sql-analyzer, test-case-generator, test-data-generator, tdd-code-generator, incident-diagnosis, impact-analysis, data-lineage, log-query, dependency-upgrade, design-doc-generator, performance-profiler, dead-code-detector, pr-review, boilerplate-scaffold, codebase-qa, pod-match, early-warning, scope-creep, delivery-intelligence
AAS agents: bookkeeper, reconciler, statement-generator, tax-compliance, audit-preparer, anomaly-detective, causal-accountant
Copilot: general intelligence queries about the business, strategy, metrics, forecasting
Agent Creation: creating, deploying, setting up, or building AI agents/monitors/automations

## Agent Creation Routing
If user wants to CREATE, SET UP, BUILD, DEPLOY, or MAKE an AI agent, worker, automation, or monitor, return serviceRoute.type = "create-agent" with an agentSpec.
Examples:
- "Create an agent to monitor delivery health" → domain: delivery-intelligence, trigger: manual
- "Set up alerts for flight risk engineers" → domain: early-warning, trigger: scheduled, schedule: "0 9 * * *"
- "Build a weekly scope creep tracker" → domain: scope-creep, trigger: scheduled, schedule: "0 9 * * 1"
- "Make an agent that recommends pods" → domain: pod-match, trigger: manual
- "Deploy an automation to watch my engagements" → domain: delivery-intelligence, trigger: scheduled

## SE-aaS Routing Guide
- SQL review/optimization → sql-analyzer
- Generate test cases → test-case-generator
- Generate mock/seed/test data → test-data-generator
- TDD / implement with tests → tdd-code-generator
- Incident/outage diagnosis → incident-diagnosis
- Blast radius / downstream impact → impact-analysis
- Data flow / where data comes from → data-lineage
- Search/query logs → log-query
- Outdated/upgrade dependencies → dependency-upgrade
- Generate HLD/LLD/design doc → design-doc-generator
- Performance profiling / slow endpoints → performance-profiler
- Dead/unused code detection → dead-code-detector
- PR / code review → pr-review
- Scaffold / boilerplate generation → boilerplate-scaffold
- How does code work / explain codebase → codebase-qa
- Recommend / assign / which pod or team → pod-match
- Velocity collapse / sprint velocity / at-risk engagement / bottleneck risk / flight risk / overallocation / engineer capacity → early-warning
- Scope creep / scope drift / story point drift / unplanned work / scope integrity → scope-creep
- Engagement health / delivery intelligence / health score / RAG status / forecast → delivery-intelligence

## AAS Routing Guide
- P&L / income statement / revenue breakdown / expense analysis → statement-generator
- Balance sheet / assets / liabilities → statement-generator
- Cash flow / burn rate / runway → statement-generator
- Reconciliation / trial balance / month-end → reconciler
- Journal entries / account classification → bookkeeper
- GST / tax / IRAS / VAT → tax-compliance
- Audit readiness / workpapers → audit-preparer
- Anomaly / Benford / duplicate / fraud → anomaly-detective
- Causal financial analysis → causal-accountant

## Business Domains
finance, growth, cs, marketing, product, strategy, engineering, people, revenue, operations, compliance

## Intents
lookup (simple fact retrieval), explain (why/how), predict (future), simulate (what-if), diagnose (root cause), build (create model), compare (cross-domain), monitor (status), optimize (improve), recommend (suggest), audit (compliance), general (conversational)

## Complexity Routes
- fast_query: simple factual lookups, greetings, status checks (score < 0.2)
- action_domain: analysis, forecasting, single-domain computation (score 0.2-0.6)
- agent_orchestration: multi-step, multi-domain, comprehensive analysis (score > 0.6)

## requiredData Guide
Set each flag based on what data the query actually needs:
- needsCausalEdges: query asks about cause/effect, correlations, what drives what
- needsPatterns: query asks about trends, patterns, insights, anomalies
- needsCascadeRules: query involves cross-domain cascade effects
- needsEntityLinks: query references specific PRs, Jira tickets, Slack threads
- needsVelocityData: query about engineering velocity, PR throughput, cycle time
- needsBottleneckData: query about reviewer bottlenecks, team concentration
- needsSignals: query needs recent signal data (engineering events, metrics)
- needsPredictions: query asks about forecasts or brain's predictions
- needsEvolution: query about brain's learning progress, intelligence score
- needsCorrections: query where past corrections might be relevant
- needsAccountingPatterns: query about accounting/financial patterns
- needsFinancialEdges: query about financial causal relationships

Output ONLY valid JSON matching this schema:
{"intent":"<intent>","confidence":<0-1>,"domains":["<domain>"],"serviceRoute":{"type":"<copilot|se-aas|aas|create-agent>","seaasDomain":"<optional>","aasDomain":"<optional>","agentSpec":{"name":"<agent name if create-agent>","description":"<what it does>","domain":"<delivery-intelligence|early-warning|pod-match|scope-creep|custom>","trigger":"<manual|scheduled|event>","schedule":"<cron expression if scheduled, optional>"}},"complexity":{"score":<0-1>,"route":"<fast_query|action_domain|agent_orchestration>","reasoning":"<1 sentence>"},"entities":[{"type":"<pr|jira_ticket|person|metric|date_range|code_ref|account|domain>","value":"<extracted>","raw":"<span>"}],"requiredData":{"needsCausalEdges":<bool>,"needsPatterns":<bool>,"needsCascadeRules":<bool>,"needsEntityLinks":<bool>,"needsVelocityData":<bool>,"needsBottleneckData":<bool>,"needsSignals":<bool>,"needsPredictions":<bool>,"needsEvolution":<bool>,"needsCorrections":<bool>,"needsAccountingPatterns":<bool>,"needsFinancialEdges":<bool>}}`;

// ============================================================================
// LRU CACHE — Avoid repeat LLM calls for same queries
// ============================================================================

interface CacheEntry {
  interpretation: QueryInterpretation;
  expiresAt: number;
}

function createLRUCache(maxEntries: number, ttlMs: number) {
  const cache = new Map<string, CacheEntry>();

  function normalizeKey(query: string, serviceHint?: ServiceType): string {
    return `${(serviceHint || 'any')}:${query.toLowerCase().trim().replace(/\s+/g, ' ')}`;
  }

  function get(query: string, serviceHint?: ServiceType): QueryInterpretation | null {
    const key = normalizeKey(query, serviceHint);
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      cache.delete(key);
      return null;
    }
    // Move to end (most recently used)
    cache.delete(key);
    cache.set(key, entry);
    return entry.interpretation;
  }

  function set(query: string, serviceHint: ServiceType | undefined, interpretation: QueryInterpretation): void {
    const key = normalizeKey(query, serviceHint);
    // Evict oldest if at capacity
    if (cache.size >= maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { interpretation, expiresAt: Date.now() + ttlMs });
  }

  function clear(): void {
    cache.clear();
  }

  return { get, set, clear };
}

// ============================================================================
// TOKEN BUDGET COMPUTATION — Query-Adaptive
// ============================================================================

function computeAdaptiveTokenBudget(
  route: DispatchRoute,
  requiredData: RequiredDataSignals,
): TokenBudget {
  // Base budget by route
  const baseBudget = route === 'fast_query' ? 4000
    : route === 'agent_orchestration' ? 15000
    : 12000;

  // Count how many data categories are active
  const activeFlags = [
    requiredData.needsCausalEdges,
    requiredData.needsPatterns,
    requiredData.needsCascadeRules,
    requiredData.needsEntityLinks,
    requiredData.needsVelocityData || requiredData.needsBottleneckData,
    requiredData.needsSignals,
    requiredData.needsPredictions || requiredData.needsEvolution,
    requiredData.needsCorrections,
    requiredData.needsAccountingPatterns || requiredData.needsFinancialEdges,
  ].filter(Boolean).length;

  // If few categories needed, reduce total budget
  const activeFraction = Math.max(0.3, activeFlags / 9);
  const totalBudget = Math.round(baseBudget * activeFraction);

  // Distribute proportionally
  const causalWeight = requiredData.needsCausalEdges ? 2 : 0;
  const patternWeight = requiredData.needsPatterns ? 1.5 : 0;
  const signalWeight = requiredData.needsSignals ? 1.5 : 0;
  const rulesWeight = requiredData.needsCascadeRules ? 1 : 0;
  const domainWeight = (requiredData.needsVelocityData || requiredData.needsBottleneckData
    || requiredData.needsEntityLinks || requiredData.needsAccountingPatterns
    || requiredData.needsFinancialEdges) ? 2 : 0;

  const totalWeight = causalWeight + patternWeight + signalWeight + rulesWeight + domainWeight || 1;

  return {
    total: totalBudget,
    causal: Math.floor(totalBudget * (causalWeight / totalWeight)),
    patterns: Math.floor(totalBudget * (patternWeight / totalWeight)),
    signals: Math.floor(totalBudget * (signalWeight / totalWeight)),
    rules: Math.floor(totalBudget * (rulesWeight / totalWeight)),
    domain: Math.floor(totalBudget * (domainWeight / totalWeight)),
  };
}

// ============================================================================
// FALLBACK — Map regex DispatchAssessment to QueryInterpretation
// ============================================================================

function fallbackToRegex(query: string, startMs: number): QueryInterpretation {
  const assessor = createDispatchAssessor();
  const assessment = assessor.assess(query);

  // All requiredData = true (load everything, same as pre-upgrade behavior)
  const allRequired: RequiredDataSignals = {
    needsCausalEdges: true,
    needsPatterns: true,
    needsCascadeRules: true,
    needsEntityLinks: true,
    needsVelocityData: true,
    needsBottleneckData: true,
    needsSignals: true,
    needsPredictions: true,
    needsEvolution: true,
    needsCorrections: true,
    needsAccountingPatterns: true,
    needsFinancialEdges: true,
  };

  return {
    intent: assessment.intent,
    confidence: assessment.confidence,
    domains: assessment.domains,
    primaryDomain: assessment.primaryDomain,
    serviceRoute: { type: 'copilot' },
    complexity: {
      score: assessment.complexityScore,
      route: assessment.route,
      reasoning: 'Regex fallback — loading all context',
    },
    entities: [],
    requiredData: allRequired,
    tokenBudget: computeAdaptiveTokenBudget(assessment.route, allRequired),
    source: 'regex-fallback',
    latencyMs: performance.now() - startMs,
  };
}

// ============================================================================
// VALIDATION — Sanitize LLM JSON output
// ============================================================================

interface RawLLMResponse {
  intent?: string;
  confidence?: number;
  domains?: string[];
  serviceRoute?: {
    type?: string;
    seaasDomain?: string;
    aasDomain?: string;
    agentSpec?: {
      name?: string;
      description?: string;
      domain?: string;
      trigger?: string;
      schedule?: string;
      requiredInputs?: string[];
    };
  };
  complexity?: {
    score?: number;
    route?: string;
    reasoning?: string;
  };
  entities?: Array<{
    type?: string;
    value?: string;
    raw?: string;
  }>;
  requiredData?: Record<string, unknown>;
}

function validateAndNormalize(raw: RawLLMResponse, query: string, startMs: number): QueryInterpretation | null {
  try {
    // Intent
    const intent: UserIntent = VALID_INTENTS.has(raw.intent as UserIntent)
      ? raw.intent as UserIntent
      : 'general';

    // Confidence
    const confidence = typeof raw.confidence === 'number'
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0.7;

    // Domains
    const rawDomains = Array.isArray(raw.domains) ? raw.domains : [];
    const domains = rawDomains
      .filter((d): d is BusinessDomain => VALID_DOMAINS.has(d as BusinessDomain))
      .slice(0, 5);
    if (domains.length === 0) domains.push('finance', 'strategy');

    // Service route
    const routeType = raw.serviceRoute?.type;
    const serviceRoute: ServiceRouteDecision = { type: 'copilot' };

    if (routeType === 'create-agent') {
      const rawSpec = raw.serviceRoute?.agentSpec;
      const VALID_AGENT_DOMAINS = new Set(['delivery-intelligence', 'early-warning', 'pod-match', 'scope-creep', 'custom']);
      const VALID_TRIGGERS = new Set(['manual', 'scheduled', 'event']);
      const agentDomain = VALID_AGENT_DOMAINS.has(rawSpec?.domain || '') ? rawSpec?.domain as AgentSpec['domain'] : 'custom';
      const agentTrigger = VALID_TRIGGERS.has(rawSpec?.trigger || '') ? rawSpec?.trigger as AgentSpec['trigger'] : 'manual';
      serviceRoute.type = 'create-agent';
      serviceRoute.agentSpec = {
        name: rawSpec?.name || `${agentDomain} Agent`,
        description: rawSpec?.description || query,
        domain: agentDomain,
        trigger: agentTrigger,
        schedule: rawSpec?.schedule,
        requiredInputs: rawSpec?.requiredInputs,
      };
    } else if (routeType === 'se-aas' && raw.serviceRoute?.seaasDomain) {
      const seaasDomain = raw.serviceRoute.seaasDomain;
      if (VALID_SEAAS_DOMAINS.has(seaasDomain)) {
        serviceRoute.type = 'se-aas';
        serviceRoute.seaasDomain = seaasDomain;
        serviceRoute.seaasInput = extractSeaasInput(query, seaasDomain);
      }
    } else if (routeType === 'aas' && raw.serviceRoute?.aasDomain) {
      const aasDomain = raw.serviceRoute.aasDomain;
      if (VALID_AAS_DOMAINS.has(aasDomain)) {
        serviceRoute.type = 'aas';
        serviceRoute.aasDomain = aasDomain;
        serviceRoute.aasInput = { question: query };
      }
    }

    // Complexity
    const complexityScore = typeof raw.complexity?.score === 'number'
      ? Math.max(0, Math.min(1, raw.complexity.score))
      : 0.3;
    const complexityRoute: DispatchRoute = VALID_ROUTES.has(raw.complexity?.route as DispatchRoute)
      ? raw.complexity!.route as DispatchRoute
      : 'action_domain';

    // Entities
    const entities: ExtractedEntity[] = [];
    if (Array.isArray(raw.entities)) {
      for (const e of raw.entities.slice(0, 10)) {
        if (e && typeof e.value === 'string' && e.value.length > 0) {
          entities.push({
            type: (['pr', 'jira_ticket', 'person', 'metric', 'date_range', 'code_ref', 'account', 'domain']
              .includes(e.type || '') ? e.type : 'domain') as ExtractedEntity['type'],
            value: e.value,
            raw: e.raw || e.value,
          });
        }
      }
    }

    // Required data signals
    const rd = raw.requiredData || {};
    const requiredData: RequiredDataSignals = {
      needsCausalEdges: rd.needsCausalEdges === true,
      needsPatterns: rd.needsPatterns === true,
      needsCascadeRules: rd.needsCascadeRules === true,
      needsEntityLinks: rd.needsEntityLinks === true,
      needsVelocityData: rd.needsVelocityData === true,
      needsBottleneckData: rd.needsBottleneckData === true,
      needsSignals: rd.needsSignals === true,
      needsPredictions: rd.needsPredictions === true,
      needsEvolution: rd.needsEvolution === true,
      needsCorrections: rd.needsCorrections === true,
      needsAccountingPatterns: rd.needsAccountingPatterns === true,
      needsFinancialEdges: rd.needsFinancialEdges === true,
    };

    // Add domain filters based on entities
    for (const entity of entities) {
      if (entity.type === 'pr' || entity.type === 'jira_ticket') {
        requiredData.needsEntityLinks = true;
        requiredData.entityLinkFilter = entity.value;
      }
    }

    // If SE-aaS engineering route, ensure engineering signals are loaded
    if (serviceRoute.type === 'se-aas') {
      requiredData.needsSignals = true;
      requiredData.signalDomainFilter = 'engineering%';
    }

    // If AAS route, ensure accounting context is loaded
    if (serviceRoute.type === 'aas') {
      requiredData.needsAccountingPatterns = true;
      requiredData.needsFinancialEdges = true;
    }

    // Ensure at least patterns are loaded (the minimum useful context)
    if (!requiredData.needsPatterns && !requiredData.needsCausalEdges
      && !requiredData.needsSignals && intent !== 'general') {
      requiredData.needsPatterns = true;
    }

    const tokenBudget = computeAdaptiveTokenBudget(complexityRoute, requiredData);

    return {
      intent,
      confidence,
      domains: domains as BusinessDomain[],
      primaryDomain: domains[0] as BusinessDomain,
      serviceRoute,
      complexity: {
        score: complexityScore,
        route: complexityRoute,
        reasoning: raw.complexity?.reasoning || '',
      },
      entities,
      requiredData,
      tokenBudget,
      source: 'llm',
      latencyMs: performance.now() - startMs,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// SE-aaS INPUT EXTRACTION — Build domain-specific input from query
// ============================================================================

function extractSeaasInput(query: string, domain: string): Record<string, unknown> {
  const codeMatch = query.match(/```(?:\w+)?\s*([\s\S]+?)```/);
  const language = detectLanguageFromQuery(query);

  switch (domain) {
    case 'sql-analyzer':
      return {
        query: codeMatch?.[1]?.trim() || query,
        analysisTypes: ['correctness', 'performance', 'security', 'style'],
        databaseType: 'postgresql',
      };
    case 'test-case-generator':
      return { code: codeMatch?.[1]?.trim() || query, language, coverage: 'comprehensive' };
    case 'test-data-generator':
      return { description: query, format: 'json', count: 10 };
    case 'tdd-code-generator':
      return { description: query, language };
    case 'incident-diagnosis':
      return {
        description: query,
        severity: /critical|p0|sev.?0/i.test(query) ? 'critical' : 'high',
      };
    case 'impact-analysis':
      return { description: query, changeType: 'code_change' };
    case 'data-lineage':
      return { description: query };
    case 'log-query':
      return { query, timeRange: '24h' };
    case 'dependency-upgrade':
      return {
        manifest: codeMatch?.[1]?.trim() || '{}',
        ecosystem: /pip|python/i.test(query) ? 'pip' : /go\b/i.test(query) ? 'go' : 'npm',
      };
    case 'design-doc-generator': {
      const isReverse = /reverse|from\s+code|extract\s+design/i.test(query);
      return {
        direction: isReverse ? 'reverse' : 'forward',
        requirements: isReverse ? undefined : query,
        sourceCode: isReverse ? (codeMatch?.[1]?.trim() || query) : codeMatch?.[1]?.trim(),
        level: /hld\s+and\s+lld|both/i.test(query) ? 'both' : /lld/i.test(query) ? 'lld' : 'hld',
      };
    }
    case 'performance-profiler':
      return { traceData: query };
    case 'dead-code-detector':
      return { sourceCode: codeMatch?.[1]?.trim() || query, language };
    case 'pr-review': {
      const prMatch = query.match(/#(\d+)/);
      return {
        diff: codeMatch?.[1]?.trim() || query,
        prNumber: prMatch ? parseInt(prMatch[1]) : undefined,
        checkFor: ['bugs', 'security', 'performance', 'style', 'test_coverage'],
      };
    }
    case 'boilerplate-scaffold':
      return { description: query, template: codeMatch?.[1]?.trim(), language, includeTests: true, includeLogging: true };
    case 'codebase-qa':
      return { question: query, includeGitHistory: true };
    // ── SE-aaS Delivery Intelligence domains ────────────────────────────
    case 'pod-match':
      return {
        description: query,
        requirements: query,
        urgency: /urgent|critical|asap|immediate/i.test(query) ? 'high' : 'normal',
      };
    case 'early-warning':
      return {
        description: query,
        checkVelocityCollapse: /velocity|collapse|slow|decline|sprint/i.test(query),
        checkBottleneck: /bottleneck|review.{0,20}load|block/i.test(query),
        checkFlightRisk: /flight.?risk|leaving|quit|attrition/i.test(query),
      };
    case 'scope-creep':
      return {
        description: query,
        checkAlerts: true,
      };
    case 'delivery-intelligence':
      return {
        description: query,
        includeHealthScores: true,
        includePodMatches: true,
        includeScopeAlerts: true,
        includeEngineerHealth: true,
      };
    default:
      return { description: query };
  }
}

function detectLanguageFromQuery(query: string): string {
  const lower = query.toLowerCase();
  if (/typescript|\.ts\b/i.test(lower)) return 'typescript';
  if (/python|\.py\b/i.test(lower)) return 'python';
  if (/javascript|\.js\b/i.test(lower)) return 'javascript';
  if (/java\b/i.test(lower)) return 'java';
  if (/go\b|golang/i.test(lower)) return 'go';
  if (/rust\b|\.rs\b/i.test(lower)) return 'rust';
  return 'typescript';
}

// ============================================================================
// FACTORY — createLLMQueryInterpreter
// ============================================================================

/**
 * Create an LLM-powered query interpreter.
 *
 * Uses Claude Haiku for fast semantic classification (~200ms).
 * Falls back to regex dispatch-assessor on any failure.
 *
 * @example
 * ```typescript
 * const interpreter = createLLMQueryInterpreter({
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
 * });
 *
 * const interpretation = await interpreter.interpret("What if we increase marketing spend by 20%?");
 * // → { intent: 'simulate', domains: ['marketing', 'finance'], serviceRoute: { type: 'copilot' }, ... }
 * ```
 */
export function createLLMQueryInterpreter(config: LLMQueryInterpreterConfig): LLMQueryInterpreterInstance {
  const {
    anthropicApiKey,
    timeoutMs = 500,
    enableCache = true,
    maxCacheEntries = 100,
    cacheTtlMs = 300_000, // 5 minutes
  } = config;

  const cache = enableCache ? createLRUCache(maxCacheEntries, cacheTtlMs) : null;

  async function interpret(
    query: string,
    context?: { serviceHint?: ServiceType },
  ): Promise<QueryInterpretation> {
    const startMs = performance.now();

    // Short-circuit: empty or very short queries
    if (!query || query.trim().length < 3) {
      return fallbackToRegex(query || '', startMs);
    }

    // Check cache
    if (cache) {
      const cached = cache.get(query, context?.serviceHint);
      if (cached) {
        return { ...cached, latencyMs: performance.now() - startMs };
      }
    }

    try {
      // Dynamic import to avoid bundling Anthropic SDK in non-LLM contexts
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: anthropicApiKey });

      // Haiku call with timeout
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response;
      try {
        response = await client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 1024,
          system: CLASSIFIER_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: query }],
        }, { signal: controller.signal as any });
      } finally {
        clearTimeout(timer);
      }

      // Extract JSON from response
      // Cast to any[] first: SDK ^0.74 adds ThinkingBlock to ContentBlock union
      // which the DTS builder fails to narrow through a user-defined type guard.
      const text = (response.content as any[])
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map(block => block.text)
        .join('');

      // Parse JSON — handle potential markdown wrapping
      const jsonText = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
      const raw: RawLLMResponse = JSON.parse(jsonText);

      // Validate and normalize
      const interpretation = validateAndNormalize(raw, query, startMs);
      if (!interpretation) {
        return fallbackToRegex(query, startMs);
      }

      // Cache successful result
      if (cache) {
        cache.set(query, context?.serviceHint, interpretation);
      }

      return interpretation;
    } catch (err) {
      // Any failure → graceful fallback to regex
      const errMsg = (err as Error)?.message || String(err);
      const isAbort = (err as Error)?.name === 'AbortError' || errMsg.includes('aborted');
      if (isAbort) {
        // Distinguish between our own timeout abort and an external abort (e.g. request signal)
        console.warn(
          `[LLMQueryInterpreter] LLM classification aborted after ${timeoutMs}ms timeout, falling back to regex. ` +
          'If this fires frequently, increase timeoutMs in createLLMQueryInterpreter config.'
        );
      } else {
        console.warn('[LLMQueryInterpreter] LLM classification failed, falling back to regex:', errMsg);
      }
      return fallbackToRegex(query, startMs);
    }
  }

  function toDispatchAssessment(interpretation: QueryInterpretation): DispatchAssessment {
    const complexityFactors: ComplexityFactors = {
      domainCount: interpretation.domains.length,
      requiresTemporal: interpretation.intent === 'predict' || interpretation.intent === 'monitor',
      requiresCausal: interpretation.requiredData.needsCausalEdges,
      requiresCounterfactual: interpretation.intent === 'simulate',
      requiresMultiStep: interpretation.complexity.route === 'agent_orchestration',
      hasSpecificMetrics: interpretation.entities.some(e => e.type === 'metric'),
      isComparison: interpretation.intent === 'compare',
      estimatedTokens: interpretation.tokenBudget.total,
    };

    return {
      route: interpretation.complexity.route,
      intent: interpretation.intent,
      domains: interpretation.domains,
      primaryDomain: interpretation.primaryDomain,
      complexityScore: interpretation.complexity.score,
      complexityFactors,
      requiredCapabilities: [],
      needsLLM: interpretation.complexity.route !== 'fast_query',
      needsAction: ['predict', 'simulate', 'diagnose', 'build', 'optimize', 'compare'].includes(interpretation.intent),
      confidence: interpretation.confidence,
      latencyMs: interpretation.latencyMs,
    };
  }

  function clearCache(): void {
    cache?.clear();
  }

  return { interpret, toDispatchAssessment, clearCache };
}
