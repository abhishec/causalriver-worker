/**
 * CopilotFramework — Claude-Grade Generic Copilot Architecture
 * =============================================================
 *
 * Brain Analog: The Broca-Wernicke Language Network — takes raw brain activity
 * (data, analysis, reasoning) and produces coherent, structured, high-quality
 * natural language responses. Just as Broca's Area handles production while
 * Wernicke's handles comprehension, this framework handles both understanding
 * user queries AND producing structured, grounded responses.
 *
 * WHY THIS EXISTS:
 * Every NexusBrain app (Finance Jarvis, Code Intelligence, etc.) was building
 * its own copilot from scratch — duplicating SSE streaming, prompt building,
 * context threading, output structuring. This framework provides a SINGLE
 * high-quality copilot that any domain app plugs into.
 *
 * ARCHITECTURE (inspired by Claude's own architecture):
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
 *   │  │  (context threading, follow-up, state management)  │ │
 *   │  └──────────────────────┬─────────────────────────────┘ │
 *   │                         │                               │
 *   │  ┌──────────────────────▼─────────────────────────────┐ │
 *   │  │                  QualityGate                        │ │
 *   │  │  (confidence, citations, hallucination prevention)  │ │
 *   │  └──────────────────────┬─────────────────────────────┘ │
 *   │                         │                               │
 *   │  ┌──────────────────────▼─────────────────────────────┐ │
 *   │  │              ResponseStream                         │ │
 *   │  │  (SSE streaming, artifacts, structured events)      │ │
 *   │  └────────────────────────────────────────────────────┘ │
 *   └─────────────────────────────────────────────────────────┘
 *
 * THE 5 CONTRACTS EVERY DOMAIN APP IMPLEMENTS:
 *
 *   1. DataProvider    — "Here's my raw data" (Xero data, GitHub data, etc.)
 *   2. AnalysisEngine  — "Here's what the brain computed" (insights, risks, etc.)
 *   3. OutputSections  — "Here's how to present my data" (tables, scorecards)
 *   4. PersonaConfig   — "Here's who the copilot should be" (CFO, CTO, etc.)
 *   5. QualityRules    — "Here's what correctness means" (never fabricate $, etc.)
 *
 * @packageDocumentation
 */

// ============================================================================
// CORE TYPES — The Contracts
// ============================================================================

/**
 * Severity levels for insights and alerts.
 * Ordered from least to most severe.
 */
export type CopilotSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * User intent classification — what the user wants to DO.
 */
export type CopilotIntent =
  | 'analyze'     // "Show me insights on..."
  | 'diagnose'    // "Why is X happening?"
  | 'predict'     // "What will happen if..."
  | 'compare'     // "How does X compare to Y?"
  | 'recommend'   // "What should I do about..."
  | 'summarize'   // "Give me an overview of..."
  | 'deep_dive'   // "Tell me everything about..."
  | 'general';    // Default catch-all

/**
 * A single data point that the domain provides.
 * This is the atomic unit — everything builds from these.
 */
export interface DataPoint {
  /** Unique key (e.g., "revenue.arr", "engineering.deploy_frequency") */
  key: string;
  /** Human-readable label */
  label: string;
  /** The value (number, string, boolean, etc.) */
  value: unknown;
  /** Unit for display (e.g., "$", "%", "months", "days") */
  unit?: string;
  /** How to format for display (e.g., "currency", "percentage", "integer") */
  format?: 'currency' | 'percentage' | 'integer' | 'decimal' | 'duration' | 'raw';
  /** Trend direction if applicable */
  trend?: 'up' | 'down' | 'flat';
  /** Trend magnitude (e.g., "+12.5%") */
  trendLabel?: string;
  /** Domain this belongs to (e.g., "finance", "engineering") */
  domain?: string;
  /** Confidence in this data point (0-1) */
  confidence?: number;
  /** Time period (e.g., "2024-01", "Q3 2024") */
  period?: string;
}

/**
 * A pre-computed insight from the brain's analysis engine.
 * These are the brain's "thoughts" — the copilot PRESENTS them, never invents them.
 */
export interface BrainInsight {
  /** Unique identifier */
  id: string;
  /** Severity level */
  severity: CopilotSeverity;
  /** Category (domain-specific) */
  category: string;
  /** Short title */
  title: string;
  /** Detailed description with specific numbers */
  description: string;
  /** Actionable recommendation */
  recommendation?: string;
  /** Supporting data points */
  evidence: DataPoint[];
  /** Confidence in this insight (0-1) */
  confidence: number;
  /** Impact magnitude (arbitrary scale, for sorting) */
  impact?: number;
}

/**
 * A causal relationship discovered by the brain.
 */
export interface CopilotCausalEdge {
  source: string;
  target: string;
  effectSize: number;
  lagDays: number;
  pValue: number;
  naturalLanguage?: string;
  isConfounded?: boolean;
}

/**
 * An action item the brain recommends.
 */
export interface CopilotAction {
  /** What to do */
  action: string;
  /** Why it matters */
  rationale: string;
  /** Timeline: immediate | short_term | medium_term | long_term */
  timeline: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  /** Expected savings or impact */
  expectedImpact?: string;
  /** Who should own this */
  owner?: string;
  /** Priority */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Additional detail */
  detail?: string;
}

/**
 * A risk the brain has identified.
 */
export interface CopilotRisk {
  /** Risk type (e.g., "cash_runway", "churn_spike", "deploy_failure") */
  type: string;
  /** Description */
  description: string;
  /** Probability: low | medium | high */
  probability: 'low' | 'medium' | 'high';
  /** Impact description */
  impact: string;
  /** Mitigation strategy */
  mitigation: string;
}

/**
 * A scenario analysis from the brain.
 */
export interface CopilotScenario {
  /** Scenario name (e.g., "Best Case", "Worst Case") */
  name: string;
  /** Key assumptions */
  assumptions: string[];
  /** Outcome description */
  outcome: string;
  /** Key metrics in this scenario */
  metrics: DataPoint[];
}

// ============================================================================
// OUTPUT SECTION SYSTEM — Reusable Structured Templates
// ============================================================================

/**
 * A table for structured data presentation.
 */
export interface OutputTable {
  /** Table title */
  title?: string;
  /** Column headers */
  columns: string[];
  /** Row data (each row is an array of strings) */
  rows: string[][];
  /** Optional highlight rows (indices that should be bold/highlighted) */
  highlightRows?: number[];
}

/**
 * A health scorecard dimension.
 */
export interface ScorecardDimension {
  /** Dimension name (e.g., "Growth", "Profitability") */
  dimension: string;
  /** Score (0-100) */
  score: number;
  /** Rating label */
  rating: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  /** Key detail explaining the score */
  detail: string;
}

/**
 * A section of the copilot's output.
 * Each section is a self-contained unit that can be rendered independently.
 */
export interface OutputSection {
  /** Section identifier (unique within a response) */
  id: string;
  /** Display title with optional emoji prefix */
  title: string;
  /** Section type determines rendering */
  type: 'narrative' | 'table' | 'scorecard' | 'actions' | 'forecast' | 'causal' | 'kpi_grid' | 'custom';
  /** Priority for ordering (lower = higher priority) */
  priority: number;
  /** Whether this section is required (shown even if empty) */
  required: boolean;
  /** Rendering instructions for the LLM */
  instructions: string;
  /** Pre-computed data for this section */
  data: {
    /** Narrative text (for 'narrative' type) */
    narrative?: string;
    /** Table data (for 'table' type) */
    table?: OutputTable;
    /** Scorecard dimensions (for 'scorecard' type) */
    scorecard?: {
      dimensions: ScorecardDimension[];
      overallScore: number;
      overallRating: string;
      verdict: string;
    };
    /** Action items (for 'actions' type) */
    actions?: {
      immediate: CopilotAction[];
      shortTerm: CopilotAction[];
      mediumTerm: CopilotAction[];
      longTerm: CopilotAction[];
      totalSavings?: string;
    };
    /** Forecast data (for 'forecast' type) */
    forecast?: {
      table: OutputTable;
      risks: string[];
      confidence: string;
    };
    /** Causal chains (for 'causal' type) */
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
    /** KPI grid (for 'kpi_grid' type) */
    kpis?: DataPoint[];
    /** Custom data (for 'custom' type) */
    custom?: Record<string, unknown>;
  };
}

// ============================================================================
// DOMAIN ADAPTER — The Plugin Interface
// ============================================================================

/**
 * The DomainAdapter is what EVERY app implements to plug into the copilot.
 * It's the contract between the domain and the generic framework.
 *
 * @example Finance Jarvis adapter:
 * ```typescript
 * const financeAdapter: DomainAdapter = {
 *   domain: 'finance',
 *   persona: { name: 'Finance Jarvis', role: 'AI CFO Copilot', ... },
 *   getDataSnapshot: () => ({ kpis: [...], trends: [...] }),
 *   getInsights: () => analysis.insights,
 *   getOutputSections: () => [overspendingSection, anomalySection, ...],
 *   getQualityRules: () => ['Never fabricate dollar amounts', ...],
 * };
 * ```
 */
export interface DomainAdapter {
  /** Domain identifier (e.g., "finance", "engineering", "cs") */
  domain: string;

  /** Display name for this copilot (e.g., "Finance Jarvis", "Code Intelligence") */
  displayName: string;

  /** Persona configuration */
  persona: CopilotPersona;

  /**
   * CONTRACT 1: Provide raw data snapshot.
   * Returns all KPIs, metrics, and data points the brain has access to.
   * These form the DATA LAYER of the 3-layer prompt.
   */
  getDataSnapshot(): CopilotDataSnapshot;

  /**
   * CONTRACT 2: Provide pre-computed insights.
   * Returns brain-analyzed insights, risks, actions.
   * These form the ANALYSIS LAYER of the 3-layer prompt.
   */
  getInsights(): CopilotInsightBundle;

  /**
   * CONTRACT 3: Provide output section templates.
   * Returns the structured sections the response should contain.
   * These form the OUTPUT TEMPLATE LAYER of the 3-layer prompt.
   */
  getOutputSections(intent: CopilotIntent): OutputSection[];

  /**
   * CONTRACT 4: Provide quality rules.
   * Rules the LLM must follow to maintain correctness.
   */
  getQualityRules(): string[];

  /**
   * CONTRACT 5 (optional): Custom intent detection.
   * If the domain has specialized intent understanding.
   */
  detectIntent?(message: string): CopilotIntent;

  /**
   * Optional: Provide causal edges relevant to this domain.
   */
  getCausalEdges?(): CopilotCausalEdge[];

  /**
   * Optional: Provide scenario analyses.
   */
  getScenarios?(): CopilotScenario[];
}

/**
 * The copilot persona — who the AI should be.
 */
export interface CopilotPersona {
  /** Persona name (e.g., "Finance Jarvis") */
  name: string;
  /** Role (e.g., "AI CFO Copilot for a Series A SaaS Company") */
  role: string;
  /** Areas of expertise */
  expertise: string[];
  /** Response style instructions */
  responseStyle: string;
  /** Data sources the persona has access to */
  dataSources: string[];
  /** Key behavioral rules */
  rules: string[];
}

/**
 * A snapshot of all data the domain provides.
 */
export interface CopilotDataSnapshot {
  /** Key performance indicators */
  kpis: DataPoint[];
  /** Time series trends */
  trends?: Array<{
    period: string;
    metrics: DataPoint[];
  }>;
  /** Any additional structured data */
  sections?: Record<string, DataPoint[]>;
}

/**
 * Bundle of pre-computed insights from the brain.
 */
export interface CopilotInsightBundle {
  /** Ranked insights */
  insights: BrainInsight[];
  /** Identified risks */
  risks: CopilotRisk[];
  /** Recommended actions */
  actions: CopilotAction[];
  /** Bottom line summary */
  bottomLine: string;
  /** Any additional analysis sections */
  custom?: Record<string, unknown>;
}

// ============================================================================
// PROMPT ARCHITECT — 3-Layer Prompt System
// ============================================================================

/**
 * Build a complete system prompt from a domain adapter.
 *
 * The prompt has 3 layers:
 * 1. DATA LAYER — Raw numbers from the domain
 * 2. ANALYSIS LAYER — Pre-computed insights from the brain
 * 3. OUTPUT TEMPLATE — Strict structure for the response
 *
 * This is the key innovation: the brain does the THINKING,
 * the LLM does the PRESENTING. No hallucination possible because
 * every number in the response comes from pre-computed data.
 */
export function buildCopilotPrompt(adapter: DomainAdapter, intent: CopilotIntent): string {
  const persona = adapter.persona;
  const data = adapter.getDataSnapshot();
  const insights = adapter.getInsights();
  const sections = adapter.getOutputSections(intent);
  const qualityRules = adapter.getQualityRules();
  const causalEdges = adapter.getCausalEdges?.() || [];
  const scenarios = adapter.getScenarios?.() || [];

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

  // KPIs
  if (data.kpis.length > 0) {
    parts.push('## Key Performance Indicators');
    for (const kpi of data.kpis) {
      const formatted = formatDataPoint(kpi);
      const trendStr = kpi.trendLabel ? ` (${kpi.trendLabel})` : '';
      parts.push(`- ${kpi.label}: ${formatted}${trendStr}`);
    }
    parts.push('');
  }

  // Additional data sections
  if (data.sections) {
    for (const [sectionName, points] of Object.entries(data.sections)) {
      parts.push(`## ${sectionName}`);
      for (const dp of points) {
        parts.push(`- ${dp.label}: ${formatDataPoint(dp)}`);
      }
      parts.push('');
    }
  }

  // Trends
  if (data.trends && data.trends.length > 0) {
    parts.push('## Historical Trends');
    for (const period of data.trends) {
      const metricStrs = period.metrics.map(m => `${m.label} ${formatDataPoint(m)}`).join(' | ');
      parts.push(`${period.period}: ${metricStrs}`);
    }
    parts.push('');
  }

  // Causal edges
  if (causalEdges.length > 0) {
    parts.push('## Causal Relationships (Brain-Discovered)');
    for (const edge of causalEdges) {
      const confounded = edge.isConfounded ? ' [POSSIBLY CONFOUNDED]' : '';
      parts.push(`- ${edge.source} → ${edge.target}: ${(edge.effectSize * 100).toFixed(0)}% effect, ${edge.lagDays}d lag${edge.naturalLanguage ? ' — ' + edge.naturalLanguage : ''}${confounded}`);
    }
    parts.push('');
  }

  // ── LAYER 2: ANALYSIS ────────────────────────────────────────────────
  parts.push('═'.repeat(70));
  parts.push('PRE-COMPUTED ANALYSIS — Use these directly in your response');
  parts.push('═'.repeat(70));
  parts.push('');

  // Insights
  if (insights.insights.length > 0) {
    parts.push('## Brain-Detected Insights (severity-ranked)');
    for (const insight of insights.insights.slice(0, 12)) {
      parts.push(`[${insight.severity.toUpperCase()}] ${insight.title}: ${insight.description}${insight.recommendation ? ' → Recommendation: ' + insight.recommendation : ''}`);
    }
    parts.push('');
  }

  // Risks
  if (insights.risks.length > 0) {
    parts.push('## Risk Assessment');
    for (const risk of insights.risks) {
      parts.push(`- [${risk.probability.toUpperCase()} PROB] ${risk.type}: ${risk.description} | Impact: ${risk.impact} | Mitigation: ${risk.mitigation}`);
    }
    parts.push('');
  }

  // Actions
  if (insights.actions.length > 0) {
    parts.push('## Recommended Actions (Brain-Prioritized)');
    const grouped = groupActions(insights.actions);
    for (const [timeline, actions] of Object.entries(grouped)) {
      if (actions.length > 0) {
        parts.push(`\n${timeline.toUpperCase()}:`);
        for (const a of actions) {
          parts.push(`- ${a.action}${a.expectedImpact ? ' | Impact: ' + a.expectedImpact : ''}${a.owner ? ' | Owner: ' + a.owner : ''}`);
        }
      }
    }
    parts.push('');
  }

  // Scenarios
  if (scenarios.length > 0) {
    parts.push('## Scenario Analysis');
    for (const s of scenarios) {
      parts.push(`- ${s.name}: ${s.outcome} (${s.assumptions.join(', ')})`);
    }
    parts.push('');
  }

  // Bottom line
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

  // Generate output template from sections
  const orderedSections = [...sections].sort((a, b) => a.priority - b.priority);

  parts.push(`When answering, structure your response using these sections IN ORDER:\n`);

  for (const section of orderedSections) {
    parts.push(`## ${section.title}`);
    parts.push(section.instructions);

    // Inject section-specific data directly
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
  // Universal rules that apply to ALL copilots
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
// CONVERSATION INTELLIGENCE — Multi-turn Context Management
// ============================================================================

/**
 * Manages conversation state for multi-turn interactions.
 */
export interface ConversationState {
  /** Conversation ID */
  id: string;
  /** Message history */
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    intent?: CopilotIntent;
  }>;
  /** Accumulated context (what the user has asked about) */
  topicsDiscussed: string[];
  /** Any entity state provided by the user */
  entityState?: Record<string, unknown>;
}

/**
 * Create a conversation state manager.
 */
export function createConversationManager() {
  const conversations = new Map<string, ConversationState>();

  function getOrCreate(id: string): ConversationState {
    if (!conversations.has(id)) {
      conversations.set(id, {
        id,
        messages: [],
        topicsDiscussed: [],
      });
    }
    return conversations.get(id)!;
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

    // Track topics
    if (role === 'user' && intent) {
      if (!conv.topicsDiscussed.includes(intent)) {
        conv.topicsDiscussed.push(intent);
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
      const truncated = msg.content.length > 200
        ? msg.content.substring(0, 200) + '...'
        : msg.content;
      summary.push(`- ${prefix}: ${truncated}`);
    }

    return summary.join('\n');
  }

  function clear(conversationId: string): void {
    conversations.delete(conversationId);
  }

  return {
    getOrCreate,
    addMessage,
    getRecentHistory,
    buildConversationSummary,
    clear,
  };
}

// ============================================================================
// INTENT DETECTION — Universal Intent Classification
// ============================================================================

const INTENT_PATTERNS: Array<{ intent: CopilotIntent; keywords: string[] }> = [
  {
    intent: 'diagnose',
    keywords: ['why', 'root cause', 'problem', 'issue', 'declining', 'dropping',
               'wrong', 'debug', 'investigate', 'diagnose'],
  },
  {
    intent: 'predict',
    keywords: ['predict', 'forecast', 'what would', 'what if', 'scenario',
               'project', 'estimate', 'simulate', 'happen if', 'next quarter'],
  },
  {
    intent: 'compare',
    keywords: ['compare', 'versus', 'vs', 'difference', 'better', 'worse',
               'benchmark', 'relative to'],
  },
  {
    intent: 'recommend',
    keywords: ['should', 'recommend', 'suggest', 'what to do', 'advice',
               'improve', 'optimize', 'reduce', 'cut'],
  },
  {
    intent: 'summarize',
    keywords: ['summary', 'overview', 'brief', 'quick', 'high-level',
               'tldr', 'dashboard'],
  },
  {
    intent: 'deep_dive',
    keywords: ['everything', 'comprehensive', 'full analysis', 'deep dive',
               'detailed', 'all insights', 'complete', 'thorough'],
  },
  {
    intent: 'analyze',
    keywords: ['analyze', 'analysis', 'insight', 'show me', 'tell me about',
               'break down', 'explain', 'understand'],
  },
];

/**
 * Detect user intent from a message.
 * Domain adapters can override this with their own detection.
 */
export function detectCopilotIntent(message: string): CopilotIntent {
  const lower = message.toLowerCase();

  for (const { intent, keywords } of INTENT_PATTERNS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return intent;
    }
  }

  return 'general';
}

// ============================================================================
// SSE STREAM — Unified Streaming
// ============================================================================

/**
 * Create an SSE stream for copilot responses.
 * This is the unified streaming layer all copilots use.
 */
export function createCopilotSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const send = (data: string) => {
    controller?.enqueue(encoder.encode(`data: ${data}\n\n`));
  };

  const sendText = (text: string) => {
    send(JSON.stringify({ text }));
  };

  const sendArtifact = (artifact: Record<string, unknown>) => {
    send(JSON.stringify({ artifact }));
  };

  const sendSection = (section: OutputSection) => {
    send(JSON.stringify({ section }));
  };

  const sendError = (error: string) => {
    send(JSON.stringify({ error }));
  };

  const sendMetadata = (metadata: Record<string, unknown>) => {
    send(JSON.stringify({ metadata }));
  };

  const close = () => {
    send('[DONE]');
    controller?.close();
  };

  return { stream, send, sendText, sendArtifact, sendSection, sendError, sendMetadata, close };
}

// ============================================================================
// COPILOT FACTORY — The Main Entry Point
// ============================================================================

/**
 * Configuration for creating a copilot instance.
 */
export interface CopilotConfig {
  /** The domain adapter (required) */
  adapter: DomainAdapter;
  /** LLM provider */
  provider: 'anthropic' | 'openai';
  /** API key */
  apiKey: string;
  /** Model to use (default: claude-sonnet-4-5-20250929) */
  model?: string;
  /** Max tokens (default: 8192) */
  maxTokens?: number;
  /** Enable conversation memory (default: true) */
  enableMemory?: boolean;
  /** Additional brain context (from causal graph DB) */
  brainContext?: string;
  /** Stream response (default: true) */
  streaming?: boolean;
}

/**
 * A copilot instance — the main thing domain apps use.
 */
export interface CopilotInstance {
  /**
   * Handle a user message and return an SSE stream.
   */
  chat(message: string, options?: {
    conversationId?: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    entityState?: Record<string, unknown>;
  }): {
    stream: ReadableStream;
    headers: Record<string, string>;
  };

  /**
   * Get the full system prompt (for debugging/testing).
   */
  getSystemPrompt(intent?: CopilotIntent): string;

  /**
   * Get the adapter for direct access.
   */
  getAdapter(): DomainAdapter;
}

/**
 * Create a copilot instance.
 *
 * @example
 * ```typescript
 * const copilot = createCopilotInstance({
 *   adapter: financeJarvisAdapter,
 *   provider: 'anthropic',
 *   apiKey: process.env.ANTHROPIC_API_KEY!,
 * });
 *
 * const { stream, headers } = copilot.chat('Show me overspending insights');
 * return new Response(stream, { headers });
 * ```
 */
export function createCopilotInstance(config: CopilotConfig): CopilotInstance {
  const {
    adapter,
    provider,
    apiKey,
    model = 'claude-sonnet-4-5-20250929',
    maxTokens = 8192,
    enableMemory = true,
    brainContext,
  } = config;

  const conversationManager = enableMemory ? createConversationManager() : null;

  function getSystemPrompt(intent: CopilotIntent = 'general'): string {
    let prompt = buildCopilotPrompt(adapter, intent);

    // Augment with brain context if available
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
    }
  ) {
    const intent = adapter.detectIntent?.(message) || detectCopilotIntent(message);
    const systemPrompt = getSystemPrompt(intent);
    const conversationId = options?.conversationId || `conv_${Date.now()}`;

    // Track in memory
    if (conversationManager) {
      conversationManager.addMessage(conversationId, 'user', message, intent);
    }

    // Build messages array
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Add conversation history
    if (options?.conversationHistory) {
      const recent = options.conversationHistory.slice(-8);
      for (const msg of recent) {
        messages.push({ role: msg.role, content: msg.content });
      }
    } else if (conversationManager) {
      const history = conversationManager.getRecentHistory(conversationId, 8);
      // Don't include the current message (already added above)
      for (const msg of history.slice(0, -1)) {
        messages.push(msg);
      }
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    // Create SSE stream
    const { stream, sendText, sendMetadata, sendError, close } = createCopilotSSEStream();

    // Send metadata first
    (async () => {
      try {
        sendMetadata({
          intent,
          domain: adapter.domain,
          persona: adapter.persona.name,
          conversationId,
        });

        if (provider === 'anthropic') {
          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          const anthropic = new Anthropic({ apiKey });

          const anthropicStream = anthropic.messages.stream({
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages,
          });

          for await (const event of anthropicStream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              sendText(event.delta.text);
            }
          }
        }
        // OpenAI support can be added here

        close();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        sendError(`Failed to get response: ${errorMessage}`);
        close();
      }
    })();

    return {
      stream,
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

/**
 * Format a DataPoint for display in prompts.
 */
export function formatDataPoint(dp: DataPoint): string {
  const val = dp.value;
  if (val == null) return 'N/A';

  switch (dp.format) {
    case 'currency':
      if (typeof val === 'number') {
        if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
        if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
        return `$${val.toFixed(0)}`;
      }
      return `$${val}`;
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

/**
 * Format a table for prompt injection.
 */
function formatTableForPrompt(table: OutputTable): string {
  if (table.rows.length === 0) return '(No data)';

  const lines: string[] = [];
  if (table.title) lines.push(table.title);

  // Header
  lines.push('| ' + table.columns.join(' | ') + ' |');
  lines.push('| ' + table.columns.map(() => '---').join(' | ') + ' |');

  // Rows
  for (const row of table.rows) {
    lines.push('| ' + row.join(' | ') + ' |');
  }

  return lines.join('\n');
}

/**
 * Group actions by timeline.
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
    }
  }

  return groups;
}
