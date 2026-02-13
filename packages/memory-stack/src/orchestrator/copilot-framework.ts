/**
 * CopilotFramework — Claude-Grade Generic Copilot Architecture (V2 — CTO Audit)
 * ================================================================================
 *
 * Brain Analog: The Broca-Wernicke Language Network — takes raw brain activity
 * (data, analysis, reasoning) and produces coherent, structured, high-quality
 * natural language responses. Just as Broca's Area handles production while
 * Wernicke's handles comprehension, this framework handles both understanding
 * user queries AND producing structured, grounded responses.
 *
 * V2 CHANGES (CTO Audit — 40 gaps fixed):
 *   - CRITICAL: Real QualityGate with post-generation number validation
 *   - CRITICAL: Conversation state LRU eviction (maxEntries + TTL)
 *   - CRITICAL: SSE write-after-close guards + AbortController integration
 *   - CRITICAL: Provider validation — error on unsupported provider
 *   - HIGH: Scored intent detection with disambiguation (not first-match)
 *   - HIGH: DomainAdapter supports async contracts (Promise<T>)
 *   - HIGH: Currency symbol configurable via DataPoint
 *   - HIGH: Insight truncation limit configurable
 *   - HIGH: Custom data from CopilotInsightBundle injected into prompt
 *   - MEDIUM: groupActions no longer silently drops unknown timelines
 *   - MEDIUM: Framework version field for adapter compatibility
 *
 * ARCHITECTURE:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │                    CopilotFramework                     │
 *   │                                                         │
 *   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
 *   │  │  DomainAdapter│  │ PromptArchitect│  │OutputTemplate│ │
 *   │  │  (pluggable)  │  │ (3-layer)     │  │Engine        │ │
 *   │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
 *   │         │                  │                  │         │
 *   │  ┌──────▼──────────────────▼──────────────────▼───────┐ │
 *   │  │              ConversationIntelligence               │ │
 *   │  │  (LRU eviction, TTL, topic extraction)             │ │
 *   │  └──────────────────────┬─────────────────────────────┘ │
 *   │                         │                               │
 *   │  ┌──────────────────────▼─────────────────────────────┐ │
 *   │  │                  QualityGate                        │ │
 *   │  │  (number registry + post-gen validation)            │ │
 *   │  └──────────────────────┬─────────────────────────────┘ │
 *   │                         │                               │
 *   │  ┌──────────────────────▼─────────────────────────────┐ │
 *   │  │              ResponseStream                         │ │
 *   │  │  (SSE + abort + write-after-close guard)            │ │
 *   │  └────────────────────────────────────────────────────┘ │
 *   └─────────────────────────────────────────────────────────┘
 *
 * @packageDocumentation
 */

/** Framework version — adapters can check compatibility */
export const COPILOT_FRAMEWORK_VERSION = '2.0.0';

// ============================================================================
// OBSERVABILITY — Structured Logging Hook
// ============================================================================

/**
 * Optional logger interface. If provided, the framework logs key events.
 * Compatible with NexusLogger from @nexus-ai/memory-stack observability.
 */
export interface CopilotLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** No-op logger used when no logger is provided */
const NULL_LOGGER: CopilotLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

// ============================================================================
// SINGLETON SDK CACHE — Import once, reuse across calls
// ============================================================================

let _anthropicModule: typeof import('@anthropic-ai/sdk') | null = null;

/** Cached dynamic import — resolves once, returns cached module thereafter */
async function getAnthropicSDK(): Promise<typeof import('@anthropic-ai/sdk')> {
  if (!_anthropicModule) {
    _anthropicModule = await import('@anthropic-ai/sdk');
  }
  return _anthropicModule;
}

// ============================================================================
// CORE TYPES — The Contracts
// ============================================================================

export type CopilotSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type CopilotIntent =
  | 'analyze'
  | 'diagnose'
  | 'predict'
  | 'compare'
  | 'recommend'
  | 'summarize'
  | 'deep_dive'
  | 'general';

/**
 * A single data point that the domain provides.
 * Value is `string | number | boolean` — not `unknown` — for type safety.
 */
export interface DataPoint {
  key: string;
  label: string;
  value: string | number | boolean | null;
  unit?: string;
  /** Currency symbol for 'currency' format (default: '$') */
  currencySymbol?: string;
  format?: 'currency' | 'percentage' | 'integer' | 'decimal' | 'duration' | 'raw';
  trend?: 'up' | 'down' | 'flat';
  trendLabel?: string;
  domain?: string;
  confidence?: number;
  period?: string;
}

export interface BrainInsight {
  id: string;
  severity: CopilotSeverity;
  category: string;
  title: string;
  description: string;
  recommendation?: string;
  /** Supporting evidence — adapters SHOULD populate this for quality gate validation */
  evidence: DataPoint[];
  confidence: number;
  impact?: number;
}

export interface CopilotCausalEdge {
  source: string;
  target: string;
  effectSize: number;
  lagDays: number;
  /** p-value. Use NaN if not available (never fake 0.05) */
  pValue: number;
  naturalLanguage?: string;
  isConfounded?: boolean;
}

export interface CopilotAction {
  action: string;
  rationale: string;
  timeline: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  expectedImpact?: string;
  owner?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  detail?: string;
}

export interface CopilotRisk {
  type: string;
  description: string;
  probability: 'low' | 'medium' | 'high';
  impact: string;
  mitigation: string;
}

export interface CopilotScenario {
  name: string;
  assumptions: string[];
  outcome: string;
  metrics: DataPoint[];
}

// ============================================================================
// OUTPUT SECTION SYSTEM — Reusable Structured Templates
// ============================================================================

export interface OutputTable {
  title?: string;
  columns: string[];
  rows: string[][];
  highlightRows?: number[];
}

export interface ScorecardDimension {
  dimension: string;
  score: number;
  rating: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  detail: string;
}

export interface OutputSection {
  id: string;
  title: string;
  type: 'narrative' | 'table' | 'scorecard' | 'actions' | 'forecast' | 'causal' | 'kpi_grid' | 'custom';
  priority: number;
  required: boolean;
  /** Which intents this section is relevant for. If omitted, shown for all intents. */
  relevantIntents?: CopilotIntent[];
  instructions: string;
  data: {
    narrative?: string;
    table?: OutputTable;
    scorecard?: {
      dimensions: ScorecardDimension[];
      overallScore: number;
      overallRating: string;
      verdict: string;
    };
    actions?: {
      immediate: CopilotAction[];
      shortTerm: CopilotAction[];
      mediumTerm: CopilotAction[];
      longTerm: CopilotAction[];
      totalSavings?: string;
    };
    forecast?: {
      table: OutputTable;
      risks: string[];
      confidence: string;
    };
    causal?: {
      chains: Array<{
        group: string;
        edges: Array<{
          flow: string;
          effectSize: number;
          explanation: string;
        }>;
      }>;
    };
    kpis?: DataPoint[];
    custom?: Record<string, unknown>;
  };
}

// ============================================================================
// DOMAIN ADAPTER — The Plugin Interface (supports sync AND async)
// ============================================================================

export interface DomainAdapter {
  /** Domain identifier */
  domain: string;
  /** Display name */
  displayName: string;
  /** Persona configuration */
  persona: CopilotPersona;
  /** Framework version this adapter targets */
  frameworkVersion?: string;

  /** CONTRACT 1: Data snapshot (sync or async) */
  getDataSnapshot(): CopilotDataSnapshot | Promise<CopilotDataSnapshot>;
  /** CONTRACT 2: Pre-computed insights (sync or async) */
  getInsights(): CopilotInsightBundle | Promise<CopilotInsightBundle>;
  /** CONTRACT 3: Output section templates (sync or async) */
  getOutputSections(intent: CopilotIntent): OutputSection[] | Promise<OutputSection[]>;
  /** CONTRACT 4: Quality rules */
  getQualityRules(): string[];
  /** CONTRACT 5 (optional): Custom intent detection */
  detectIntent?(message: string): CopilotIntent;
  /** Optional: Causal edges */
  getCausalEdges?(): CopilotCausalEdge[];
  /** Optional: Scenario analyses */
  getScenarios?(): CopilotScenario[];
}

export interface CopilotPersona {
  name: string;
  role: string;
  expertise: string[];
  responseStyle: string;
  dataSources: string[];
  rules: string[];
}

export interface CopilotDataSnapshot {
  kpis: DataPoint[];
  trends?: Array<{ period: string; metrics: DataPoint[] }>;
  sections?: Record<string, DataPoint[]>;
}

export interface CopilotInsightBundle {
  insights: BrainInsight[];
  risks: CopilotRisk[];
  actions: CopilotAction[];
  bottomLine: string;
  /** Domain-specific analysis sections — will be serialized into the prompt */
  custom?: Record<string, unknown>;
}

// ============================================================================
// QUALITY GATE — Real Number Registry + Post-Generation Validation
// ============================================================================

/**
 * Result of quality gate validation on a generated response.
 */
export interface QualityGateResult {
  passed: boolean;
  /** Numbers found in the response that are NOT in the data registry */
  ungroundedNumbers: string[];
  /** Sections that were required but missing from the response */
  missingSections: string[];
  /** Total numbers found in response */
  totalNumbers: number;
  /** Numbers that matched the data registry */
  groundedNumbers: number;
  /** Grounding ratio (0-1) */
  groundingRatio: number;
}

/**
 * Build a registry of all numbers present in the data layers.
 * Used by the quality gate to validate LLM output.
 */
export function buildNumberRegistry(data: CopilotDataSnapshot, insights: CopilotInsightBundle): Set<string> {
  const registry = new Set<string>();

  function addNumber(val: string | number | boolean | null | undefined): void {
    if (val == null || typeof val === 'boolean') return;
    if (typeof val === 'number') {
      // Add multiple representations: raw, formatted, rounded
      registry.add(String(val));
      registry.add(val.toFixed(0));
      registry.add(val.toFixed(1));
      registry.add(val.toFixed(2));
      if (Math.abs(val) >= 1_000_000) {
        registry.add((val / 1_000_000).toFixed(2));
        registry.add((val / 1_000_000).toFixed(1));
      }
      if (Math.abs(val) >= 1_000) {
        registry.add((val / 1_000).toFixed(0));
        registry.add((val / 1_000).toFixed(1));
      }
      // Also add as percentage representation
      registry.add((val * 100).toFixed(0));
      registry.add((val * 100).toFixed(1));
    }
    if (typeof val === 'string' && /[\d.]+/.test(val)) {
      const nums = val.match(/[\d.]+/g);
      if (nums) nums.forEach(n => registry.add(n));
    }
  }

  // Register all KPIs
  for (const kpi of data.kpis) {
    addNumber(kpi.value);
  }

  // Register section data
  if (data.sections) {
    for (const points of Object.values(data.sections)) {
      for (const dp of points) {
        addNumber(dp.value);
      }
    }
  }

  // Register trend data
  if (data.trends) {
    for (const period of data.trends) {
      for (const m of period.metrics) {
        addNumber(m.value);
      }
    }
  }

  // Register insight numbers
  for (const insight of insights.insights) {
    for (const ev of insight.evidence) {
      addNumber(ev.value);
    }
    // Extract numbers from description text
    const descNums = insight.description.match(/[\d.]+/g);
    if (descNums) descNums.forEach(n => registry.add(n));
  }

  return registry;
}

/**
 * Validate a generated response against the data registry.
 * This is the REAL quality gate — not just prompt instructions.
 */
export function validateResponse(
  response: string,
  numberRegistry: Set<string>,
  requiredSections: string[]
): QualityGateResult {
  // Extract all numbers from the response (skip common non-data numbers like list indices)
  const responseNumbers = response.match(/\d+\.?\d*/g) || [];
  // Filter out very small numbers (1-9) that are likely list indices, not data
  const significantNumbers = responseNumbers.filter(n => {
    const num = parseFloat(n);
    return num >= 10 || n.includes('.');
  });

  let groundedCount = 0;
  const ungrounded: string[] = [];

  for (const num of significantNumbers) {
    if (numberRegistry.has(num)) {
      groundedCount++;
    } else {
      ungrounded.push(num);
    }
  }

  // Check for required sections in the response
  const missingSections: string[] = [];
  for (const section of requiredSections) {
    // Check if the section title (without emoji) appears in the response
    const cleanTitle = section.replace(/[\u{1F600}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    if (!response.includes(cleanTitle) && !response.toLowerCase().includes(cleanTitle.toLowerCase())) {
      missingSections.push(section);
    }
  }

  const total = significantNumbers.length;
  const ratio = total > 0 ? groundedCount / total : 1;

  return {
    passed: ratio >= 0.7 && missingSections.length === 0,
    ungroundedNumbers: ungrounded.slice(0, 20), // Cap for readability
    missingSections,
    totalNumbers: total,
    groundedNumbers: groundedCount,
    groundingRatio: ratio,
  };
}

// ============================================================================
// PROMPT ARCHITECT — 3-Layer Prompt System
// ============================================================================

/** Configuration for prompt building */
export interface PromptConfig {
  /** Max insights to include in prompt (default: 12) */
  maxInsights?: number;
  /** Max causal edges to include (default: 30) */
  maxCausalEdges?: number;
  /** Currency symbol (default: '$') */
  currencySymbol?: string;
}

export function buildCopilotPrompt(
  adapter: DomainAdapter,
  intent: CopilotIntent,
  resolvedData?: { data: CopilotDataSnapshot; insights: CopilotInsightBundle; sections: OutputSection[] },
  promptConfig?: PromptConfig,
): string {
  const persona = adapter.persona;
  const data = resolvedData?.data ?? (adapter.getDataSnapshot() as CopilotDataSnapshot);
  const insights = resolvedData?.insights ?? (adapter.getInsights() as CopilotInsightBundle);
  const allSections = resolvedData?.sections ?? (adapter.getOutputSections(intent) as OutputSection[]);
  const qualityRules = adapter.getQualityRules();
  const causalEdges = adapter.getCausalEdges?.() || [];
  const scenarios = adapter.getScenarios?.() || [];

  const maxInsights = promptConfig?.maxInsights ?? 12;
  const maxEdges = promptConfig?.maxCausalEdges ?? 30;

  // Filter sections by intent relevance
  const sections = allSections.filter(s => {
    if (!s.relevantIntents || s.relevantIntents.length === 0) return true;
    return s.relevantIntents.includes(intent) || intent === 'deep_dive' || intent === 'general';
  });

  const parts: string[] = [];

  // ── IDENTITY ─────────────────────────────────────────────────────────
  parts.push(`You are ${persona.name} — ${persona.role}.`);
  if (persona.dataSources.length > 0) {
    parts.push(`You analyze REAL data from: ${persona.dataSources.join(', ')}.`);
  }
  parts.push(`The NexusBrain engine has pre-computed all analysis below. Your job is to PRESENT this data clearly — never invent numbers.\n`);

  // ── LAYER 1: DATA ────────────────────────────────────────────────────
  parts.push('═'.repeat(70));
  parts.push('DATA LAYER — All numbers below come from the NexusBrain analysis engine');
  parts.push('═'.repeat(70));
  parts.push('');

  if (data.kpis.length > 0) {
    parts.push('## Key Performance Indicators');
    for (const kpi of data.kpis) {
      const formatted = formatDataPoint(kpi);
      const trendStr = kpi.trendLabel ? ` (${kpi.trendLabel})` : '';
      parts.push(`- ${kpi.label}: ${formatted}${trendStr}`);
    }
    parts.push('');
  }

  if (data.sections) {
    for (const [sectionName, points] of Object.entries(data.sections)) {
      if (points.length === 0) continue;
      parts.push(`## ${sectionName}`);
      for (const dp of points) {
        parts.push(`- ${dp.label}: ${formatDataPoint(dp)}`);
      }
      parts.push('');
    }
  }

  if (data.trends && data.trends.length > 0) {
    parts.push('## Historical Trends');
    for (const period of data.trends) {
      const metricStrs = period.metrics.map(m => `${m.label} ${formatDataPoint(m)}`).join(' | ');
      parts.push(`${period.period}: ${metricStrs}`);
    }
    parts.push('');
  }

  if (causalEdges.length > 0) {
    parts.push('## Causal Relationships (Brain-Discovered)');
    for (const edge of causalEdges.slice(0, maxEdges)) {
      const confounded = edge.isConfounded ? ' [POSSIBLY CONFOUNDED]' : '';
      const pValueStr = Number.isNaN(edge.pValue) ? '' : `, p=${edge.pValue.toFixed(4)}`;
      parts.push(`- ${edge.source} → ${edge.target}: ${(edge.effectSize * 100).toFixed(0)}% effect, ${edge.lagDays}d lag${pValueStr}${edge.naturalLanguage ? ' — ' + edge.naturalLanguage : ''}${confounded}`);
    }
    if (causalEdges.length > maxEdges) {
      parts.push(`  ... and ${causalEdges.length - maxEdges} more edges`);
    }
    parts.push('');
  }

  // ── LAYER 2: ANALYSIS ────────────────────────────────────────────────
  parts.push('═'.repeat(70));
  parts.push('PRE-COMPUTED ANALYSIS — Use these directly in your response');
  parts.push('═'.repeat(70));
  parts.push('');

  if (insights.insights.length > 0) {
    parts.push('## Brain-Detected Insights (severity-ranked)');
    const shown = insights.insights.slice(0, maxInsights);
    for (const insight of shown) {
      parts.push(`[${insight.severity.toUpperCase()}] ${insight.title}: ${insight.description}${insight.recommendation ? ' → Recommendation: ' + insight.recommendation : ''}`);
    }
    if (insights.insights.length > maxInsights) {
      parts.push(`(${insights.insights.length - maxInsights} additional insights omitted)`);
    }
    parts.push('');
  }

  if (insights.risks.length > 0) {
    parts.push('## Risk Assessment');
    for (const risk of insights.risks) {
      parts.push(`- [${risk.probability.toUpperCase()} PROB] ${risk.type}: ${risk.description} | Impact: ${risk.impact} | Mitigation: ${risk.mitigation}`);
    }
    parts.push('');
  }

  if (insights.actions.length > 0) {
    parts.push('## Recommended Actions (Brain-Prioritized)');
    const grouped = groupActions(insights.actions);
    for (const [timeline, actions] of Object.entries(grouped)) {
      if (actions.length > 0) {
        parts.push(`\n${timeline.toUpperCase().replace('_', ' ')}:`);
        for (const a of actions) {
          parts.push(`- ${a.action}${a.expectedImpact ? ' | Impact: ' + a.expectedImpact : ''}${a.owner ? ' | Owner: ' + a.owner : ''}`);
        }
      }
    }
    parts.push('');
  }

  if (scenarios.length > 0) {
    parts.push('## Scenario Analysis');
    for (const s of scenarios) {
      parts.push(`- ${s.name}: ${s.outcome} (${s.assumptions.join(', ')})`);
    }
    parts.push('');
  }

  // Include custom analysis sections if present
  if (insights.custom && Object.keys(insights.custom).length > 0) {
    parts.push('## Additional Domain Analysis');
    for (const [key, val] of Object.entries(insights.custom)) {
      if (typeof val === 'object' && val !== null) {
        parts.push(`### ${key}`);
        parts.push(JSON.stringify(val, null, 0).substring(0, 2000));
      } else {
        parts.push(`- ${key}: ${String(val)}`);
      }
    }
    parts.push('');
  }

  if (insights.bottomLine) {
    parts.push('## Bottom Line (Brain\'s Verdict)');
    parts.push(insights.bottomLine);
    parts.push('');
  }

  // ── LAYER 3: OUTPUT TEMPLATE ─────────────────────────────────────────
  parts.push('═'.repeat(70));
  parts.push('OUTPUT FORMAT — Follow this EXACT structure');
  parts.push('═'.repeat(70));
  parts.push('');

  const orderedSections = [...sections].sort((a, b) => a.priority - b.priority);
  parts.push(`When answering, structure your response using these sections IN ORDER:\n`);

  for (const section of orderedSections) {
    parts.push(`## ${section.title}`);
    parts.push(section.instructions);

    if (section.data.table) {
      parts.push(`\nDATA FOR THIS SECTION:`);
      parts.push(formatTableForPrompt(section.data.table));
    }
    if (section.data.narrative) {
      parts.push(`\nDATA FOR THIS SECTION:\n${section.data.narrative}`);
    }
    if (section.data.scorecard) {
      parts.push(`\nSCORECARD DATA:`);
      for (const dim of section.data.scorecard.dimensions) {
        parts.push(`- ${dim.dimension}: ${dim.score}/100 (${dim.rating}) — ${dim.detail}`);
      }
      parts.push(`Overall: ${section.data.scorecard.overallScore}/100 — ${section.data.scorecard.verdict}`);
    }
    if (section.data.actions) {
      const ad = section.data.actions;
      if (ad.immediate.length > 0) {
        parts.push(`\nIMMEDIATE ACTIONS:`);
        for (const a of ad.immediate) parts.push(`- ${a.action} | ${a.expectedImpact || ''} | ${a.owner || ''}`);
      }
      if (ad.shortTerm.length > 0) {
        parts.push(`SHORT-TERM ACTIONS:`);
        for (const a of ad.shortTerm) parts.push(`- ${a.action} | ${a.expectedImpact || ''} | ${a.owner || ''}`);
      }
      if (ad.mediumTerm.length > 0) {
        parts.push(`MEDIUM-TERM ACTIONS:`);
        for (const a of ad.mediumTerm) parts.push(`- ${a.action} | ${a.expectedImpact || ''} | ${a.owner || ''}`);
      }
      if (ad.totalSavings) {
        parts.push(`Total potential savings: ${ad.totalSavings}`);
      }
    }
    if (section.data.causal) {
      parts.push(`\nCAUSAL CHAIN DATA:`);
      for (const group of section.data.causal.chains) {
        parts.push(`### ${group.group}`);
        for (const edge of group.edges) {
          parts.push(`- ${edge.flow}: ${(edge.effectSize * 100).toFixed(0)}% effect — ${edge.explanation}`);
        }
      }
    }
    if (section.data.kpis) {
      parts.push(`\nKPI DATA:`);
      for (const kpi of section.data.kpis) {
        parts.push(`- ${kpi.label}: ${formatDataPoint(kpi)}`);
      }
    }
    parts.push('');
  }

  // ── QUALITY RULES ────────────────────────────────────────────────────
  parts.push('**CRITICAL QUALITY RULES:**');
  const universalRules = [
    'EVERY number in your response MUST come from the data above — never fabricate',
    'Use the pre-computed analysis as your PRIMARY data source',
    'Always show exact values, percentages, and thresholds',
    'Use markdown tables for data-dense sections (at least 2 tables per response)',
    'Bold important numbers: **$XXK**, **XX%**, **XX months**',
    'If a section has no data, say "Brain detected no issues in this area"',
    'For "what if" questions, use the causal chain effect sizes to compute projected impact',
  ];
  const allRules = [...universalRules, ...qualityRules];
  for (let i = 0; i < allRules.length; i++) {
    parts.push(`${i + 1}. ${allRules[i]}`);
  }

  parts.push('\nWhen the user asks a SPECIFIC question (not general analysis), answer directly using the relevant data sections, but maintain the same data-driven, numbers-first approach with tables and bold figures.');

  return parts.join('\n');
}

// ============================================================================
// CONVERSATION INTELLIGENCE — LRU Eviction + TTL
// ============================================================================

export interface ConversationState {
  id: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    intent?: CopilotIntent;
  }>;
  /** Actual topics discussed (extracted from messages, not just intent labels) */
  topicsDiscussed: string[];
  entityState?: Record<string, unknown>;
  /** Last access time for LRU eviction */
  lastAccessed: number;
}

export interface ConversationManagerConfig {
  /** Max conversations to keep in memory (default: 500) */
  maxEntries?: number;
  /** TTL for conversation entries in ms (default: 30 minutes) */
  ttlMs?: number;
  /** Max messages per conversation (default: 50) */
  maxMessagesPerConversation?: number;
}

export function createConversationManager(config?: ConversationManagerConfig) {
  const maxEntries = config?.maxEntries ?? 500;
  const ttlMs = config?.ttlMs ?? 30 * 60 * 1000; // 30 min
  const maxMsgsPerConv = config?.maxMessagesPerConversation ?? 50;
  const conversations = new Map<string, ConversationState>();

  /** Evict expired entries, then LRU if over capacity */
  function evict(): void {
    const now = Date.now();

    // Phase 1: TTL eviction
    for (const [id, conv] of conversations) {
      if (now - conv.lastAccessed > ttlMs) {
        conversations.delete(id);
      }
    }

    // Phase 2: LRU eviction if still over capacity
    if (conversations.size > maxEntries) {
      const sorted = [...conversations.entries()].sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
      const toRemove = conversations.size - maxEntries;
      for (let i = 0; i < toRemove; i++) {
        conversations.delete(sorted[i][0]);
      }
    }
  }

  function getOrCreate(id: string): ConversationState {
    if (!conversations.has(id)) {
      evict(); // Evict before creating new
      conversations.set(id, {
        id,
        messages: [],
        topicsDiscussed: [],
        lastAccessed: Date.now(),
      });
    }
    const conv = conversations.get(id)!;
    conv.lastAccessed = Date.now();
    return conv;
  }

  function addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    intent?: CopilotIntent
  ): void {
    const conv = getOrCreate(conversationId);
    conv.messages.push({
      role,
      content,
      timestamp: new Date(),
      intent,
    });

    // Cap messages per conversation
    if (conv.messages.length > maxMsgsPerConv) {
      conv.messages = conv.messages.slice(-maxMsgsPerConv);
    }

    // Extract topic entities from user messages (not just intent labels)
    if (role === 'user') {
      const words = content.toLowerCase().split(/\s+/);
      const topicKeywords = words.filter(w => w.length > 4 && !/^(about|would|could|should|their|these|those|which|where|there|please|thanks|hello)$/.test(w));
      for (const kw of topicKeywords.slice(0, 3)) {
        if (!conv.topicsDiscussed.includes(kw)) {
          conv.topicsDiscussed.push(kw);
        }
      }
      // Cap topics
      if (conv.topicsDiscussed.length > 20) {
        conv.topicsDiscussed = conv.topicsDiscussed.slice(-20);
      }
    }
  }

  function getRecentHistory(
    conversationId: string,
    maxMessages: number = 8
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const conv = getOrCreate(conversationId);
    return conv.messages.slice(-maxMessages).map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  function buildConversationSummary(conversationId: string): string | undefined {
    const conv = conversations.get(conversationId);
    if (!conv || conv.messages.length === 0) return undefined;

    const recentMessages = conv.messages.slice(-6);
    const summary: string[] = ['Previous conversation context:'];

    for (const msg of recentMessages) {
      const prefix = msg.role === 'user' ? 'User' : 'Copilot';
      // For assistant messages, take the first and last 100 chars to capture intro + conclusion
      let truncated: string;
      if (msg.content.length > 300 && msg.role === 'assistant') {
        truncated = msg.content.substring(0, 150) + ' [...] ' + msg.content.substring(msg.content.length - 100);
      } else if (msg.content.length > 200) {
        truncated = msg.content.substring(0, 200) + '...';
      } else {
        truncated = msg.content;
      }
      summary.push(`- ${prefix}: ${truncated}`);
    }

    if (conv.topicsDiscussed.length > 0) {
      summary.push(`Topics discussed so far: ${conv.topicsDiscussed.join(', ')}`);
    }

    return summary.join('\n');
  }

  function clear(conversationId: string): void {
    conversations.delete(conversationId);
  }

  /** Get current stats for observability */
  function getStats() {
    return {
      activeConversations: conversations.size,
      maxEntries,
      ttlMs,
    };
  }

  return {
    getOrCreate,
    addMessage,
    getRecentHistory,
    buildConversationSummary,
    clear,
    getStats,
  };
}

// ============================================================================
// INTENT DETECTION — Scored with Disambiguation
// ============================================================================

const INTENT_PATTERNS: Array<{ intent: CopilotIntent; keywords: string[]; weight: number }> = [
  {
    intent: 'diagnose',
    weight: 2,
    keywords: ['root cause', 'problem', 'issue', 'declining', 'dropping',
               'wrong', 'debug', 'investigate', 'diagnose'],
  },
  {
    intent: 'diagnose',
    weight: 1,
    keywords: ['why'],
  },
  {
    intent: 'predict',
    weight: 2,
    keywords: ['predict', 'forecast', 'what would', 'what if', 'scenario',
               'project', 'estimate', 'simulate', 'happen if', 'next quarter'],
  },
  {
    intent: 'compare',
    weight: 2,
    keywords: ['compare', 'versus', 'vs', 'difference', 'better', 'worse',
               'benchmark', 'relative to'],
  },
  {
    intent: 'recommend',
    weight: 2,
    keywords: ['should', 'recommend', 'suggest', 'what to do', 'advice',
               'improve', 'optimize', 'reduce', 'cut'],
  },
  {
    intent: 'summarize',
    weight: 2,
    keywords: ['summary', 'overview', 'brief', 'quick', 'high-level',
               'tldr', 'dashboard'],
  },
  {
    intent: 'deep_dive',
    weight: 2,
    keywords: ['everything', 'comprehensive', 'full analysis', 'deep dive',
               'detailed', 'all insights', 'complete', 'thorough'],
  },
  {
    intent: 'analyze',
    weight: 1,
    keywords: ['analyze', 'analysis', 'insight', 'show me', 'tell me about',
               'break down', 'explain', 'understand'],
  },
];

/**
 * Detect user intent using scored keyword matching.
 * Each matched keyword adds its weight to the intent's score.
 * Highest scoring intent wins (with 'general' as fallback).
 */
export function detectCopilotIntent(message: string): CopilotIntent {
  const lower = message.toLowerCase();
  const scores = new Map<CopilotIntent, number>();

  for (const { intent, keywords, weight } of INTENT_PATTERNS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        scores.set(intent, (scores.get(intent) || 0) + weight);
      }
    }
  }

  if (scores.size === 0) return 'general';

  // Find highest scoring intent
  let bestIntent: CopilotIntent = 'general';
  let bestScore = 0;
  for (const [intent, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  return bestIntent;
}

// ============================================================================
// SSE STREAM — With Write-After-Close Guard + Abort Support
// ============================================================================

export function createCopilotSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      // Client disconnected
      closed = true;
      controller = null;
    },
  });

  const safeSend = (data: string) => {
    if (closed || !controller) return;
    try {
      controller.enqueue(encoder.encode(`data: ${data}\n\n`));
    } catch {
      // Controller already closed — mark as closed to prevent further writes
      closed = true;
    }
  };

  const sendText = (text: string) => safeSend(JSON.stringify({ text }));
  const sendArtifact = (artifact: Record<string, unknown>) => safeSend(JSON.stringify({ artifact }));
  const sendSection = (section: OutputSection) => safeSend(JSON.stringify({ section }));
  const sendError = (error: string) => safeSend(JSON.stringify({ error }));
  const sendMetadata = (metadata: Record<string, unknown>) => safeSend(JSON.stringify({ metadata }));
  const sendQualityGate = (result: QualityGateResult) => safeSend(JSON.stringify({ qualityGate: result }));

  const close = () => {
    if (closed) return;
    closed = true;
    try {
      controller?.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller?.close();
    } catch {
      // Already closed
    }
    controller = null;
  };

  /** Check if the stream is still open */
  const isOpen = () => !closed;

  return {
    stream,
    send: safeSend,
    sendText,
    sendArtifact,
    sendSection,
    sendError,
    sendMetadata,
    sendQualityGate,
    close,
    isOpen,
  };
}

// ============================================================================
// COPILOT FACTORY — The Main Entry Point
// ============================================================================

export interface CopilotConfig {
  adapter: DomainAdapter;
  /** LLM provider — only 'anthropic' is supported. Other values throw. */
  provider: 'anthropic';
  apiKey: string;
  model?: string;
  maxTokens?: number;
  enableMemory?: boolean;
  brainContext?: string;
  /** Enable post-generation quality gate validation (default: true) */
  enableQualityGate?: boolean;
  /** Prompt configuration */
  promptConfig?: PromptConfig;
  /** Conversation manager configuration */
  conversationConfig?: ConversationManagerConfig;
  /** Optional structured logger (compatible with NexusLogger) */
  logger?: CopilotLogger;
}

export interface CopilotInstance {
  chat(message: string, options?: {
    conversationId?: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    entityState?: Record<string, unknown>;
    /** AbortSignal for cancellation (e.g., from client disconnect) */
    signal?: AbortSignal;
  }): {
    stream: ReadableStream;
    headers: Record<string, string>;
  };
  getSystemPrompt(intent?: CopilotIntent): string;
  getAdapter(): DomainAdapter;
}

export function createCopilotInstance(config: CopilotConfig): CopilotInstance {
  const {
    adapter,
    provider,
    apiKey,
    model = 'claude-sonnet-4-5-20250929',
    maxTokens = 8192,
    enableMemory = true,
    brainContext,
    enableQualityGate = true,
    promptConfig,
    conversationConfig,
    logger: userLogger,
  } = config;

  const log = userLogger || NULL_LOGGER;

  // Validate provider
  if (provider !== 'anthropic') {
    throw new Error(`Unsupported LLM provider: "${provider}". Only "anthropic" is currently supported.`);
  }

  log.info('CopilotInstance created', {
    domain: adapter.domain,
    model,
    maxTokens,
    enableMemory,
    enableQualityGate,
    frameworkVersion: COPILOT_FRAMEWORK_VERSION,
  });

  const conversationManager = enableMemory ? createConversationManager(conversationConfig) : null;

  function getSystemPrompt(intent: CopilotIntent = 'general'): string {
    let prompt = buildCopilotPrompt(adapter, intent, undefined, promptConfig);
    if (brainContext) {
      prompt += '\n\n' + brainContext;
    }
    return prompt;
  }

  function chat(
    message: string,
    options?: {
      conversationId?: string;
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
      entityState?: Record<string, unknown>;
      signal?: AbortSignal;
    }
  ) {
    const intent = adapter.detectIntent?.(message) || detectCopilotIntent(message);
    const conversationId = options?.conversationId || `conv_${Date.now()}`;

    if (conversationManager) {
      conversationManager.addMessage(conversationId, 'user', message, intent);
    }

    // Build messages array
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (options?.conversationHistory) {
      const recent = options.conversationHistory.slice(-8);
      for (const msg of recent) {
        messages.push({ role: msg.role, content: msg.content });
      }
    } else if (conversationManager) {
      const history = conversationManager.getRecentHistory(conversationId, 8);
      for (const msg of history.slice(0, -1)) {
        messages.push(msg);
      }
    }

    messages.push({ role: 'user', content: message });

    const sseStream = createCopilotSSEStream();
    const chatStartTime = Date.now();

    log.debug('chat() called', { conversationId, intent, messageLength: message.length });

    (async () => {
      try {
        // Check if already aborted
        if (options?.signal?.aborted) {
          log.warn('chat() aborted before start', { conversationId });
          sseStream.close();
          return;
        }

        // Resolve adapter data (supports async adapters)
        const adapterStartTime = Date.now();
        const [data, insights, sections] = await Promise.all([
          Promise.resolve(adapter.getDataSnapshot()),
          Promise.resolve(adapter.getInsights()),
          Promise.resolve(adapter.getOutputSections(intent)),
        ]);
        log.debug('Adapter data resolved', {
          conversationId,
          durationMs: Date.now() - adapterStartTime,
          kpiCount: data.kpis.length,
          insightCount: insights.insights.length,
          sectionCount: sections.length,
        });

        const systemPrompt = (() => {
          let prompt = buildCopilotPrompt(adapter, intent, { data, insights, sections }, promptConfig);
          if (brainContext) prompt += '\n\n' + brainContext;
          return prompt;
        })();

        sseStream.sendMetadata({
          intent,
          domain: adapter.domain,
          persona: adapter.persona.name,
          conversationId,
          frameworkVersion: COPILOT_FRAMEWORK_VERSION,
        });

        if (options?.signal?.aborted) {
          log.warn('chat() aborted after adapter resolve', { conversationId });
          sseStream.close();
          return;
        }

        // Stream from Anthropic (using cached SDK import)
        const sdk = await getAnthropicSDK();
        const anthropic = new sdk.default({ apiKey });

        log.info('Streaming from Anthropic', { conversationId, model, maxTokens, promptLength: systemPrompt.length });

        const anthropicStream = anthropic.messages.stream({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages,
        });

        // Wire abort signal to kill the stream
        const abortHandler = () => {
          log.info('Stream aborted by client', { conversationId });
          anthropicStream.abort();
          sseStream.close();
        };
        options?.signal?.addEventListener('abort', abortHandler, { once: true });

        let fullResponse = '';
        for await (const event of anthropicStream) {
          if (!sseStream.isOpen()) break;
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            fullResponse += event.delta.text;
            sseStream.sendText(event.delta.text);
          }
        }

        // Cleanup abort listener
        options?.signal?.removeEventListener('abort', abortHandler);

        // Run quality gate on the complete response
        if (enableQualityGate && fullResponse.length > 0 && sseStream.isOpen()) {
          const numberRegistry = buildNumberRegistry(data, insights);
          const requiredSectionTitles = sections
            .filter(s => s.required)
            .map(s => s.title.replace(/[\u{1F600}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim());
          const qgResult = validateResponse(fullResponse, numberRegistry, requiredSectionTitles);
          sseStream.sendQualityGate(qgResult);
          log.info('Quality gate result', {
            conversationId,
            passed: qgResult.passed,
            groundingRatio: qgResult.groundingRatio,
            totalNumbers: qgResult.totalNumbers,
            ungroundedCount: qgResult.ungroundedNumbers.length,
            missingSections: qgResult.missingSections,
          });
        }

        log.info('chat() completed', {
          conversationId,
          durationMs: Date.now() - chatStartTime,
          responseLength: fullResponse.length,
          intent,
        });

        sseStream.close();
      } catch (err) {
        if (!sseStream.isOpen()) return; // Client already disconnected
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        log.error('chat() failed', { conversationId, error: errorMessage });
        sseStream.sendError(`Failed to get response: ${errorMessage}`);
        sseStream.close();
      }
    })();

    return {
      stream: sseStream.stream,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    };
  }

  return {
    chat,
    getSystemPrompt,
    getAdapter: () => adapter,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function formatDataPoint(dp: DataPoint): string {
  const val = dp.value;
  if (val == null) return 'N/A';

  const curr = dp.currencySymbol || '$';

  switch (dp.format) {
    case 'currency':
      if (typeof val === 'number') {
        if (Math.abs(val) >= 1_000_000) return `${curr}${(val / 1_000_000).toFixed(2)}M`;
        if (Math.abs(val) >= 1_000) return `${curr}${(val / 1_000).toFixed(0)}K`;
        return `${curr}${val.toFixed(0)}`;
      }
      return `${curr}${val}`;
    case 'percentage':
      return typeof val === 'number' ? `${val.toFixed(1)}%` : `${val}%`;
    case 'integer':
      return typeof val === 'number' ? val.toFixed(0) : String(val);
    case 'decimal':
      return typeof val === 'number' ? val.toFixed(2) : String(val);
    case 'duration':
      return `${val} ${dp.unit || 'months'}`;
    default:
      return `${val}${dp.unit ? ' ' + dp.unit : ''}`;
  }
}

function formatTableForPrompt(table: OutputTable): string {
  if (table.rows.length === 0) return '(No data)';

  const lines: string[] = [];
  if (table.title) lines.push(table.title);

  lines.push('| ' + table.columns.join(' | ') + ' |');
  lines.push('| ' + table.columns.map(() => '---').join(' | ') + ' |');

  for (const row of table.rows) {
    lines.push('| ' + row.join(' | ') + ' |');
  }

  return lines.join('\n');
}

/**
 * Group actions by timeline. Unknown timelines go into 'other' (not dropped).
 */
function groupActions(actions: CopilotAction[]): Record<string, CopilotAction[]> {
  const groups: Record<string, CopilotAction[]> = {
    immediate: [],
    short_term: [],
    medium_term: [],
    long_term: [],
  };

  for (const action of actions) {
    if (groups[action.timeline]) {
      groups[action.timeline].push(action);
    } else {
      // Don't silently drop — create the group
      if (!groups['other']) groups['other'] = [];
      groups['other'].push(action);
    }
  }

  return groups;
}
