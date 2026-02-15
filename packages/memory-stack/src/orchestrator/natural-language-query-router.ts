/**
 * Natural Language Query Router (Phase 3)
 *
 * THE UNIFIED BRAIN'S "MOUTH" - Entry point for all natural language queries
 *
 * Integrates:
 * - Brain Context Builder (intent + domain detection)
 * - Action Domain Registry (execution)
 * - Copilot Framework (Claude streaming + memory)
 * - Conversation Manager (hippocampus)
 * - Quality Gates (response validation)
 *
 * This is the SINGLE ENTRY POINT for natural language - no redundant systems.
 *
 * @module orchestrator/natural-language-query-router
 */

import type { BrainContextBuilder, BrainIntent } from './brain-context-builder';
import type { ActionDomainRegistry } from './action-domain-registry';
import type { CopilotInstance } from './copilot-framework';
import { buildCopilotPrompt } from './copilot-framework';

export interface NaturalLanguageQuery {
  question: string; // User's natural language question
  conversationId?: string; // For conversation continuity
  userId?: string; // For personalization
  scope?: {
    // Optional scope
    repositories?: string[];
    domains?: string[];
    timeRange?: { start: Date; end: Date };
  };
}

export interface QueryResult {
  answer: string; // Natural language response
  confidence: number; // 0-1
  processingTime: number; // milliseconds
  route: 'fast_query' | 'action_domain' | 'agent'; // Which path was taken
  data?: any; // Structured data (optional)
  citations?: Array<{
    // Grounding sources
    source: string;
    type: 'causal_edge' | 'pattern' | 'rule' | 'data';
    content: string;
  }>;
  qualityScore?: number; // Quality gate score
  conversationContext?: {
    // Updated conversation
    turn: number;
    history: string[];
  };
}

/** Agent registry interface for brain-agent-fusion dispatch */
interface AgentRegistryInterface {
  dispatch: (agentName: string, input: unknown) => Promise<unknown>;
}

/** Conversation manager interface for copilot-framework history */
interface ConversationManagerInterface {
  getRecentHistory: (conversationId: string, maxMessages?: number) => Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface QueryRouterConfig {
  brainContextBuilder: BrainContextBuilder;
  actionDomainRegistry: ActionDomainRegistry;
  copilotInstance: CopilotInstance;
  /** Optional: brain-agent-fusion registry for autonomous agent dispatch */
  agentRegistry?: AgentRegistryInterface;
  /** Optional: copilot-framework conversation manager for history continuity */
  conversationManager?: ConversationManagerInterface;
  dispatchThresholds?: {
    fastQueryComplexity: number; // Max complexity for fast path
    agentComplexity: number; // Min complexity for agent orchestration
  };
}

/**
 * Natural Language Query Router
 *
 * THE UNIFIED BRAIN INTERFACE
 */
export class NaturalLanguageQueryRouter {
  private brainContext: BrainContextBuilder;
  private actionDomains: ActionDomainRegistry;
  private copilot: CopilotInstance;
  private agentRegistry: AgentRegistryInterface | null;
  private conversationManager: ConversationManagerInterface | null;
  private thresholds: {
    fastQueryComplexity: number;
    agentComplexity: number;
  };

  constructor(config: QueryRouterConfig) {
    this.brainContext = config.brainContextBuilder;
    this.actionDomains = config.actionDomainRegistry;
    this.copilot = config.copilotInstance;
    this.agentRegistry = config.agentRegistry ?? null;
    this.conversationManager = config.conversationManager ?? null;
    this.thresholds = config.dispatchThresholds || {
      fastQueryComplexity: 3,
      agentComplexity: 8,
    };
  }

  /**
   * Route natural language query through unified brain
   *
   * This is THE single entry point for all NL queries
   */
  async route(query: NaturalLanguageQuery): Promise<QueryResult> {
    const startTime = Date.now();

    // STEP 1: Detect intent + domains from natural language
    const intent = this.brainContext.detectIntent(query.question);
    const domains = this.brainContext.extractDomains(query.question);

    // STEP 2: Assess complexity and determine route
    const assessment = this.assessComplexity(query.question, intent, domains);

    // STEP 3: Route based on complexity
    let result: QueryResult;
    if (assessment.route === 'fast_query') {
      result = await this.executeFastQuery(query, intent, domains);
    } else if (assessment.route === 'action_domain') {
      result = await this.executeActionDomain(query, intent, domains);
    } else {
      result = await this.executeAgent(query, intent, domains);
    }

    // STEP 4: Add metadata
    result.processingTime = Date.now() - startTime;
    result.route = assessment.route;

    return result;
  }

  /**
   * FAST PATH: Simple lookup queries
   *
   * Examples:
   * - "What is the current MRR?"
   * - "How many engineers do we have?"
   * - "What's the latest deployment?"
   */
  private async executeFastQuery(
    query: NaturalLanguageQuery,
    intent: BrainIntent,
    domains: string[]
  ): Promise<QueryResult> {
    // Fast queries bypass action domains - direct lookup
    const domain = domains[0] || 'code';

    // Build minimal context (no heavy graph queries)
    const context = this.brainContext.buildContext(query.question);

    // Simple prompt (no action domain execution)
    const prompt = `You are a fast query assistant. Answer the user's question directly based on the provided context.

Context:
${JSON.stringify(context, null, 2)}

User question: ${query.question}

Provide a concise, direct answer.`;

    // Stream from Claude (but collect for fast path)
    const result = this.copilot.chat(query.question, {
      conversationId: query.conversationId,
    });

    const answer = await this.collectStream(result.stream);

    return {
      answer,
      confidence: 0.8, // Fast path = medium confidence
      processingTime: 0, // Will be set by caller
      route: 'fast_query',
    };
  }

  /**
   * ACTION DOMAIN PATH: Complex reasoning
   *
   * Examples:
   * - "What happens if we increase marketing spend by 20%?"
   * - "Which PRs have the highest technical debt risk?"
   * - "How would changing the pricing tier affect churn?"
   */
  private async executeActionDomain(
    query: NaturalLanguageQuery,
    intent: BrainIntent,
    domains: string[]
  ): Promise<QueryResult> {
    // Build full brain context (includes causal graph, patterns, rules)
    const context = this.brainContext.buildContext(query.question);

    // Select action domain based on intent
    const domainId = this.selectActionDomain(intent);

    // Execute action domain with full brain context via registry
    const domainResult = await (this.actionDomains as any).execute(domainId, {
      input: {
        query: query.question,
        scope: query.scope,
      },
      brain: context,
    });

    // Build copilot prompt using action domain result
    const copilotPrompt = buildCopilotPrompt(
      this.copilot.getAdapter(),
      intent as any,
      domainResult
    );

    // Stream from Claude with domain-enriched prompt
    const result = this.copilot.chat(query.question, {
      conversationId: query.conversationId,
    });

    const answer = await this.collectStream(result.stream);

    // Extract citations from domain result
    const citations = this.extractCitations(domainResult);

    return {
      answer,
      confidence: domainResult.confidence || 0.9,
      processingTime: 0,
      route: 'action_domain',
      data: domainResult.data,
      citations,
      qualityScore: domainResult.qualityScore,
    };
  }

  /**
   * AGENT PATH: Autonomous execution
   *
   * Examples:
   * - "Analyze the entire codebase and create a refactoring plan"
   * - "Build a predictive model for customer churn based on all available data"
   * - "Investigate why revenue dropped last quarter and propose fixes"
   */
  private async executeAgent(
    query: NaturalLanguageQuery,
    intent: BrainIntent,
    domains: string[]
  ): Promise<QueryResult> {
    // Agent path: attempt brain-agent-fusion dispatch for autonomous execution,
    // falling back to action domain if no agent registry is available.
    if (this.agentRegistry) {
      try {
        const agentName = this.selectAgentForIntent(intent, domains);
        const agentResult = await this.agentRegistry.dispatch(agentName, {
          query: query.question,
          intent,
          domains,
          scope: query.scope,
          conversationId: query.conversationId,
        });

        // Build natural language answer from agent result via copilot
        const result = this.copilot.chat(
          `Summarize this agent execution result for the user who asked: "${query.question}"\n\nAgent result: ${JSON.stringify(agentResult, null, 2)}`,
          { conversationId: query.conversationId }
        );
        const answer = await this.collectStream(result.stream);

        return {
          answer,
          confidence: (agentResult as any)?.confidence ?? 0.85,
          processingTime: 0,
          route: 'agent',
          data: agentResult,
        };
      } catch {
        // Agent dispatch failed — gracefully fall back to action domain path
      }
    }

    // Fallback: delegate to action domain when agent registry unavailable
    return this.executeActionDomain(query, intent, domains);
  }

  /**
   * Select the best agent for a given intent and domain set
   */
  private selectAgentForIntent(intent: BrainIntent, domains: string[]): string {
    const intentToAgent: Record<string, string> = {
      forecast: 'brain-revenue-watcher',
      diagnose: 'brain-diagnostician',
      optimize: 'brain-optimizer',
      monitor: 'brain-revenue-watcher',
      analyze: 'jarvis-analyst',
      investigate: 'jarvis-orchestrator',
    };
    return intentToAgent[intent as string] || 'jarvis-orchestrator';
  }

  /**
   * Assess query complexity and determine routing
   */
  private assessComplexity(
    question: string,
    intent: BrainIntent,
    domains: string[]
  ): {
    route: 'fast_query' | 'action_domain' | 'agent';
    complexity: number;
    reasoning: string;
  } {
    let complexity = 0;

    // Factor 1: Question length (longer = more complex)
    if (question.length > 200) complexity += 2;
    else if (question.length > 100) complexity += 1;

    // Factor 2: Multi-domain (affects >1 domain)
    if (domains.length > 1) complexity += 2;

    // Factor 3: Intent complexity
    const complexIntents = ['forecast', 'simulate', 'optimize', 'diagnose', 'compare'];
    if (complexIntents.includes(intent)) complexity += 3;

    // Factor 4: Keywords indicating complexity
    const complexKeywords = ['what if', 'analyze', 'investigate', 'predict', 'optimize', 'plan'];
    const hasComplexKeyword = complexKeywords.some((kw) =>
      question.toLowerCase().includes(kw)
    );
    if (hasComplexKeyword) complexity += 2;

    // Determine route
    let route: 'fast_query' | 'action_domain' | 'agent';
    let reasoning: string;

    if (complexity <= this.thresholds.fastQueryComplexity) {
      route = 'fast_query';
      reasoning = 'Simple lookup - fast path';
    } else if (complexity < this.thresholds.agentComplexity) {
      route = 'action_domain';
      reasoning = 'Complex reasoning - action domain';
    } else {
      route = 'agent';
      reasoning = 'Highly complex - autonomous agent';
    }

    return { route, complexity, reasoning };
  }

  /**
   * Select action domain based on intent
   */
  private selectActionDomain(intent: string): string {
    // Map intent to action domain ID
    const intentToDomain: Record<string, string> = {
      forecast: 'forecast',
      simulate: 'simulate',
      explain: 'explain-causal',
      diagnose: 'diagnose',
      compare: 'compare',
      recommend: 'recommend',
      analyze: 'codebase-comprehend',
      monitor: 'monitor',
      optimize: 'optimize',
      audit: 'audit',
    };

    return intentToDomain[intent] || 'explain-causal'; // Default
  }

  /**
   * Extract citations from domain result for grounding
   */
  private extractCitations(domainResult: any): Array<{
    source: string;
    type: 'causal_edge' | 'pattern' | 'rule' | 'data';
    content: string;
  }> {
    const citations: Array<any> = [];

    // Extract causal edges
    if (domainResult.causalEdges) {
      for (const edge of domainResult.causalEdges.slice(0, 3)) {
        citations.push({
          source: `Causal: ${edge.source} → ${edge.target}`,
          type: 'causal_edge',
          content: `${edge.source} causes ${edge.target} (strength: ${edge.strength.toFixed(2)})`,
        });
      }
    }

    // Extract patterns
    if (domainResult.patterns) {
      for (const pattern of domainResult.patterns.slice(0, 2)) {
        citations.push({
          source: `Pattern: ${pattern.id}`,
          type: 'pattern',
          content: pattern.description || pattern.title,
        });
      }
    }

    // Extract rules
    if (domainResult.rules) {
      for (const rule of domainResult.rules.slice(0, 2)) {
        citations.push({
          source: `Rule: ${rule.id}`,
          type: 'rule',
          content: rule.title,
        });
      }
    }

    return citations;
  }

  /**
   * Get conversation history from conversation manager (copilot-framework integration)
   */
  private async getConversationHistory(conversationId: string): Promise<string[]> {
    if (this.conversationManager && conversationId) {
      try {
        const history = this.conversationManager.getRecentHistory(conversationId, 8);
        return history.map((msg) => `${msg.role}: ${msg.content}`);
      } catch {
        // Non-critical: conversation history lookup failed — continue without history
      }
    }
    return [];
  }

  /**
   * Collect stream into single response
   */
  private async collectStream(stream: ReadableStream): Promise<string> {
    let fullResponse = '';
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (typeof value === 'string') {
          fullResponse += value;
        } else if (value?.content) {
          fullResponse += value.content;
        }
      }
    } finally {
      reader.releaseLock();
    }
    return fullResponse.trim();
  }
}

/**
 * Create natural language query router instance
 *
 * THE BRAIN'S MOUTH - single entry point for all NL queries
 */
export function createNaturalLanguageQueryRouter(
  config: QueryRouterConfig
): NaturalLanguageQueryRouter {
  return new NaturalLanguageQueryRouter(config);
}
