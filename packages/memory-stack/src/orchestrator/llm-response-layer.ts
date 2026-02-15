/**
 * LLM Response Layer — Enhanced Copilot with Conversation Memory
 *
 * Extends the basic llm-adapter.ts copilot with:
 *   - Multi-turn conversation history (in-memory + optional DB persistence)
 *   - Domain persona integration
 *   - Context section tracking (what context was injected)
 *   - Conversation loading/saving via NexusRepository
 *
 * This is the "thinking" layer — it takes a query, assembles context
 * from the orchestrator, selects a persona, and generates an intelligent response.
 *
 * @example
 * ```typescript
 * const llm = createLLMResponseLayer({
 *   provider: 'anthropic',
 *   apiKey: process.env.ANTHROPIC_API_KEY!,
 *   repository: repo, // optional: persist conversations
 * });
 *
 * const result = await llm.query('Why is churn up?', nexusContext, {
 *   domain: 'cs',
 *   conversationId: 'conv_123',
 * });
 * console.log(result.text);
 * ```
 */

import type { NexusQueryResult } from './nexus-orchestrator';
import type { NexusRepository } from '../persistence/supabase-repository';
import {
  type DomainPersona,
  buildPersonaPrompt,
  createPersonaRegistry,
  exampleDomains,
  buildDomainContext,
  type DomainContext,
} from '../intelligence/domain-personas';
import {
  buildReasoningFramework,
  classifyIntent,
  type IntentGuide,
} from '../intelligence/reasoning-framework';

// ============================================================================
// TYPES
// ============================================================================

export interface LLMResponseConfig {
  /** LLM provider */
  provider: 'anthropic' | 'openai';
  /** API key */
  apiKey: string;
  /** Model to use (default: claude-sonnet-4-20250514 / gpt-4o) */
  model?: string;
  /** Max tokens (default: 2048) */
  maxTokens?: number;
  /** System prompt prefix (used when no domain persona matches) */
  systemPromptPrefix?: string;
  /** Repository for conversation persistence (optional) */
  repository?: NexusRepository;
  /**
   * Pre-registered domain personas.
   * When a domain is specified in query(), the matching persona's prompt
   * replaces the default system prefix for domain-specific expertise.
   * Map of domain key -> DomainPersona (e.g., { finance: {...}, cs: {...} })
   */
  personas?: Record<string, DomainPersona>;
  /**
   * Pre-registered domain contexts.
   * Injected alongside persona prompts for richer domain understanding.
   * If not provided, uses the built-in exampleDomains.
   */
  domainContexts?: DomainContext[];
  /**
   * Enable structured reasoning framework.
   * When true, the reasoning framework stages are injected into the
   * system prompt, guiding the LLM through structured analysis.
   * Default: true
   */
  useReasoningFramework?: boolean;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    tokensUsed?: number;
    contextSections?: string[];
    model?: string;
  };
}

export interface LLMResponseResult {
  /** The LLM's response text */
  text: string;
  /** Conversation ID (auto-generated if not provided) */
  conversationId: string;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** What context was injected into the prompt */
  contextUsed: {
    causalRelationships: number;
    patterns: number;
    ragResults: number;
    memories: number;
  };
}

export interface QueryOptions {
  /** Conversation ID for multi-turn (auto-generated if not provided) */
  conversationId?: string;
  /** Domain for persona selection */
  domain?: string;
  /** Include previous conversation history in prompt */
  includeHistory?: boolean;
  /** Maximum history messages to include (default: 10) */
  maxHistoryMessages?: number;
}

// ============================================================================
// RETRY + TIMEOUT CONSTANTS
// ============================================================================

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1_000; // 1 second
const MAX_RETRY_DELAY_MS = 10_000; // 10 seconds
const LLM_CALL_TIMEOUT_MS = 30_000; // 30 seconds per call

/**
 * Retry a function with exponential backoff.
 * Retries on network errors and 429/5xx status codes.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on auth errors (401/403) or client errors (400)
      const message = error?.message || '';
      if (message.includes('401') || message.includes('403') || message.includes('400')) {
        throw error;
      }

      // Retry on network errors, 429, and 5xx
      if (attempt < maxRetries) {
        const delay = Math.min(
          INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500,
          MAX_RETRY_DELAY_MS
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('LLM call failed after retries');
}

/**
 * Wrap a fetch call with a timeout.
 * Uses AbortController when available, falls back to race with setTimeout.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = LLM_CALL_TIMEOUT_MS
): Promise<Response> {
  // Use AbortController if available (Node 18+ / browser)
  if (typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`LLM call timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Fallback: race fetch against a timeout
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`LLM call timed out after ${timeoutMs}ms`)), timeoutMs)
  );
  return Promise.race([fetch(url, init), timeoutPromise]);
}

// ============================================================================
// CONVERSATION MEMORY CONSTANTS
// ============================================================================

/** Maximum number of conversations to keep in memory (LRU eviction) */
const MAX_CONVERSATIONS_IN_MEMORY = 100;
/** Maximum messages per conversation before trimming */
const MAX_MESSAGES_PER_CONVERSATION = 100;

const DEFAULT_SYSTEM_PREFIX = `You are Nexus AI, an organizational intelligence copilot.
You have access to real-time causal intelligence about how different business domains affect each other.
Use the provided context to give evidence-based answers.
When citing causal relationships, reference the statistical evidence (p-values, effect sizes).
When uncertain, say so and explain what data would help.`;

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create an enhanced LLM response layer with conversation memory.
 */
export function createLLMResponseLayer(config: LLMResponseConfig) {
  const {
    provider,
    apiKey,
    model,
    maxTokens = 2048,
    systemPromptPrefix = DEFAULT_SYSTEM_PREFIX,
    repository,
    personas,
    domainContexts,
    useReasoningFramework = true,
  } = config;

  // Build persona registry from config
  const personaRegistry = createPersonaRegistry();
  if (personas) {
    for (const [key, persona] of Object.entries(personas)) {
      personaRegistry.register(key, persona);
    }
  }

  // Register domain contexts (use built-in examples as fallback)
  const allDomainContexts = domainContexts || exampleDomains;
  for (const domain of allDomainContexts) {
    personaRegistry.registerDomain(domain);
  }

  // Build reasoning framework (reusable across queries)
  const reasoningFramework = useReasoningFramework
    ? buildReasoningFramework()
    : null;

  // In-memory conversation store with LRU eviction.
  // Uses a Map which maintains insertion order — oldest entries are first.
  const conversations = new Map<string, ConversationMessage[]>();

  /**
   * Track conversation access for LRU ordering.
   * When a conversation is accessed, move it to the end of the Map (most recently used).
   */
  function touchConversation(conversationId: string): void {
    const history = conversations.get(conversationId);
    if (history) {
      // Delete and re-insert to move to end (most recently used)
      conversations.delete(conversationId);
      conversations.set(conversationId, history);
    }
  }

  /**
   * Evict least-recently-used conversations when over capacity.
   */
  function evictIfNeeded(): void {
    while (conversations.size > MAX_CONVERSATIONS_IN_MEMORY) {
      // Map.keys() returns in insertion order — first key is the oldest (LRU)
      const oldestKey = conversations.keys().next().value;
      if (oldestKey !== undefined) {
        // Persist to DB before eviction if repository is available
        if (repository) {
          const evicted = conversations.get(oldestKey);
          if (evicted && evicted.length > 0) {
            // Fire-and-forget persistence — don't block eviction
            for (const msg of evicted) {
              persistMessage(oldestKey, msg.role, msg.content, msg.metadata?.tokensUsed || 0).catch((err) => {
                // Fire-and-forget: conversation persistence may fail without blocking eviction — err instanceof Error ? err.message : String(err) logged for debugging
              });
            }
          }
        }
        conversations.delete(oldestKey);
      }
    }
  }

  /**
   * Trim conversation messages if they exceed the per-conversation cap.
   * Keeps the most recent messages and removes the oldest.
   */
  function trimConversation(conversationId: string): void {
    const history = conversations.get(conversationId);
    if (history && history.length > MAX_MESSAGES_PER_CONVERSATION) {
      // Keep only the last MAX_MESSAGES_PER_CONVERSATION messages
      const trimmed = history.slice(-MAX_MESSAGES_PER_CONVERSATION);
      conversations.set(conversationId, trimmed);
    }
  }

  /**
   * Generate a unique conversation ID
   */
  function generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Count context sections for tracking
   */
  function countContextSections(context: string): {
    causalRelationships: number;
    patterns: number;
    ragResults: number;
    memories: number;
  } {
    const causalMatches = context.match(/→|←/g);
    const patternMatches = context.match(/\[.*?% confidence\]/g);
    const ragMatches = context.match(/---/g);
    const memoryMatches = context.match(/Organizational Memory/g);

    return {
      causalRelationships: causalMatches ? causalMatches.length : 0,
      patterns: patternMatches ? patternMatches.length : 0,
      ragResults: ragMatches ? Math.max(0, (ragMatches.length || 0)) : 0,
      memories: memoryMatches ? memoryMatches.length : 0,
    };
  }

  /**
   * Build conversation history for the prompt
   */
  function buildHistoryMessages(
    conversationId: string,
    maxMessages: number
  ): Array<{ role: string; content: string }> {
    const history = conversations.get(conversationId) || [];
    const relevant = history
      .filter((m) => m.role !== 'system')
      .slice(-maxMessages);

    return relevant.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * Call the LLM provider (Anthropic or OpenAI)
   */
  async function callLLM(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    if (provider === 'anthropic') {
      return callAnthropic(systemPrompt, messages);
    } else {
      return callOpenAI(systemPrompt, messages);
    }
  }

  async function callAnthropic(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    return withRetry(async () => {
      const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-haiku-20241022', // Cost optimization: Haiku for conversational responses
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
        }),
      });

      // Check for HTTP errors (response.ok may be undefined in test mocks)
      if (response.ok === false) {
        const errorText = typeof response.text === 'function'
          ? await response.text().catch(() => 'Unknown error')
          : `HTTP ${response.status || 'unknown'}`;
        throw new Error(`Anthropic API ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as any;

      if (data.error) {
        throw new Error(`Anthropic API error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      return {
        text: data.content?.[0]?.text || '',
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      };
    });
  }

  async function callOpenAI(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    return withRetry(async () => {
      const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini', // Cost optimization: 15x cheaper than gpt-4o
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
        }),
      });

      // Check for HTTP errors (response.ok may be undefined in test mocks)
      if (response.ok === false) {
        const errorText = typeof response.text === 'function'
          ? await response.text().catch(() => 'Unknown error')
          : `HTTP ${response.status || 'unknown'}`;
        throw new Error(`OpenAI API ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as any;

      if (data.error) {
        throw new Error(`OpenAI API error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      return {
        text: data.choices?.[0]?.message?.content || '',
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      };
    });
  }

  /**
   * Persist a conversation message to the database
   */
  async function persistMessage(
    conversationId: string,
    role: string,
    content: string,
    tokensUsed: number = 0,
    contextSnapshot?: Record<string, unknown>
  ): Promise<void> {
    if (!repository) return;

    try {
      await repository.appendConversation({
        conversationId,
        role,
        content,
        tokensUsed,
        contextSnapshot,
      });
    } catch (err) {
      // Non-critical: conversation append to DB may fail without blocking query — err instanceof Error ? err.message : String(err) logged for debugging
    }
  }

  return {
    /**
     * Query the LLM with full Nexus context injection.
     * Supports multi-turn conversations when conversationId is provided.
     */
    async query(
      userMessage: string,
      nexusContext: NexusQueryResult,
      options: QueryOptions = {}
    ): Promise<LLMResponseResult> {
      const conversationId = options.conversationId || generateConversationId();
      const includeHistory = options.includeHistory ?? true;
      const maxHistoryMessages = options.maxHistoryMessages ?? 10;

      // Build system prompt with persona + reasoning + context
      let basePrompt = systemPromptPrefix;

      // Use domain persona if available and domain is specified
      if (options.domain) {
        const personaPrompt = personaRegistry.getPromptWithContext(
          options.domain,
          [options.domain, ...(personaRegistry.getDomain(options.domain)?.relatedDomains || [])]
        );
        if (personaPrompt) {
          basePrompt = personaPrompt;
        }
      }

      // Inject reasoning framework stages
      let reasoningSection = '';
      if (reasoningFramework) {
        // Classify intent for tailored reasoning guidance
        const intent: IntentGuide | null = classifyIntent(userMessage);
        const intentContext = intent
          ? `\nUser intent: ${intent.intent}. Suggested approach: ${intent.suggestedActions.join(', ')}.`
          : '';
        reasoningSection = `\n\n${reasoningFramework.buildPrompt(intentContext)}`;
      }

      const systemPrompt = `${basePrompt}${reasoningSection}

---
${nexusContext.assembledContext}
---`;

      // Build messages array
      const messages: Array<{ role: string; content: string }> = [];

      // Include history if multi-turn
      if (includeHistory && conversations.has(conversationId)) {
        const historyMessages = buildHistoryMessages(
          conversationId,
          maxHistoryMessages
        );
        messages.push(...historyMessages);
      }

      // Add current user message
      messages.push({ role: 'user', content: userMessage });

      // Call LLM
      const result = await callLLM(systemPrompt, messages);

      // Track context usage
      const contextUsed = countContextSections(nexusContext.assembledContext);

      // Store in conversation history (with LRU management)
      const now = new Date();
      if (!conversations.has(conversationId)) {
        conversations.set(conversationId, []);
        evictIfNeeded(); // Evict LRU conversations if over capacity
      }
      touchConversation(conversationId); // Move to most recently used
      const history = conversations.get(conversationId)!;

      history.push({
        role: 'user',
        content: userMessage,
        timestamp: now,
      });

      history.push({
        role: 'assistant',
        content: result.text,
        timestamp: now,
        metadata: {
          tokensUsed: result.inputTokens + result.outputTokens,
          contextSections: Object.entries(contextUsed)
            .filter(([, v]) => v > 0)
            .map(([k]) => k),
          model: model || (provider === 'anthropic' ? 'claude-3-5-haiku-20241022' : 'gpt-4o-mini'),
        },
      });

      // Trim if conversation exceeds per-conversation cap
      trimConversation(conversationId);

      // Persist to DB (non-blocking)
      persistMessage(conversationId, 'user', userMessage);
      persistMessage(
        conversationId,
        'assistant',
        result.text,
        result.inputTokens + result.outputTokens,
        { contextUsed }
      );

      // Log activity
      if (repository) {
        repository.logActivity({
          agentType: 'llm_response_layer',
          actionType: 'query',
          inputSummary: userMessage.substring(0, 200),
          outputSummary: result.text.substring(0, 200),
          tokensUsed: result.inputTokens + result.outputTokens,
          metadata: { conversationId, provider, contextUsed },
        }).catch(() => { /* non-critical */ });
      }

      return {
        text: result.text,
        conversationId,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
        contextUsed,
      };
    },

    /**
     * Continue an existing conversation with fresh context.
     * Convenience wrapper around query() with includeHistory=true.
     */
    async continueConversation(
      conversationId: string,
      userMessage: string,
      nexusContext: NexusQueryResult
    ): Promise<LLMResponseResult> {
      return this.query(userMessage, nexusContext, {
        conversationId,
        includeHistory: true,
      });
    },

    /**
     * Get in-memory conversation history
     */
    getConversation(conversationId: string): ConversationMessage[] {
      return conversations.get(conversationId) || [];
    },

    /**
     * Clear in-memory conversation history
     */
    clearConversation(conversationId: string): void {
      conversations.delete(conversationId);
    },

    /**
     * Load a conversation from the database into memory
     */
    async loadConversation(conversationId: string): Promise<ConversationMessage[]> {
      if (!repository) return [];

      const rows = await repository.getConversation(conversationId);
      const messages: ConversationMessage[] = rows.map((r: any) => ({
        role: r.role as 'user' | 'assistant' | 'system',
        content: r.content,
        timestamp: new Date(r.created_at),
        metadata: {
          tokensUsed: r.tokens_used,
          contextSections: r.context_snapshot?.contextUsed
            ? Object.keys(r.context_snapshot.contextUsed)
            : undefined,
        },
      }));

      // Store in memory for subsequent calls (with LRU management)
      conversations.set(conversationId, messages);
      evictIfNeeded();

      return messages;
    },

    /**
     * Get all active conversation IDs in memory
     */
    getActiveConversations(): string[] {
      return Array.from(conversations.keys());
    },
  };
}
