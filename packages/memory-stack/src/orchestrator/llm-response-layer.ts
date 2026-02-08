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
  /** System prompt prefix */
  systemPromptPrefix?: string;
  /** Repository for conversation persistence (optional) */
  repository?: NexusRepository;
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
  } = config;

  // In-memory conversation store
  const conversations = new Map<string, ConversationMessage[]>();

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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      }),
    });

    const data = (await response.json()) as any;

    return {
      text: data.content?.[0]?.text || '',
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    };
  }

  async function callOpenAI(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
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
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    });

    const data = (await response.json()) as any;

    return {
      text: data.choices?.[0]?.message?.content || '',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    };
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
    } catch {
      // Non-critical: don't fail the query if persistence fails
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

      // Build system prompt with context
      const systemPrompt = `${systemPromptPrefix}

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

      // Store in conversation history
      const now = new Date();
      if (!conversations.has(conversationId)) {
        conversations.set(conversationId, []);
      }
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
          model: model || (provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o'),
        },
      });

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

      // Store in memory for subsequent calls
      conversations.set(conversationId, messages);

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
