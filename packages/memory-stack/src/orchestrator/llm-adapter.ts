/**
 * LLM Adapter (Nexus Copilot)
 *
 * Wraps LLM calls with Nexus context injection.
 * Supports Anthropic and OpenAI APIs.
 */

import type { NexusQueryResult } from './nexus-orchestrator';
import { createSemanticCache, type SemanticCacheInstance } from '../infra/llm-semantic-cache';
import { createRedisClient, type RedisClientInstance } from '../infra/redis-client';

// ============================================================================
// TYPES
// ============================================================================

export interface CopilotConfig {
  /** LLM provider */
  provider: 'anthropic' | 'openai';
  /** API key */
  apiKey: string;
  /** Model to use */
  model?: string;
  /** Max tokens */
  maxTokens?: number;
  /** System prompt prefix */
  systemPromptPrefix?: string;
  /** Enable semantic response caching (default: true) */
  enableCache?: boolean;
  /** Cache TTL in seconds (default: 3600 = 1hr) */
  cacheTtlSeconds?: number;
  /** Redis client for distributed caching (design partner scale) */
  redis?: RedisClientInstance;
  /** Redis URL — auto-creates Redis client if provided (e.g. REDIS_URL env var) */
  redisUrl?: string;
}

export interface CopilotResponse {
  /** LLM response text */
  text: string;
  /** Context that was injected */
  injectedContext: string;
  /** Usage stats */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

const DEFAULT_SYSTEM_PREFIX = `You are Nexus AI, an organizational intelligence copilot.
You have access to real-time causal intelligence about how different business domains affect each other.
Use the provided context to give evidence-based answers.
When citing causal relationships, reference the statistical evidence (p-values, effect sizes).
When uncertain, say so and explain what data would help.`;

// ============================================================================
// COPILOT
// ============================================================================

/**
 * Create a Nexus Copilot that enriches LLM calls with causal context.
 *
 * @example
 * ```typescript
 * const copilot = createNexusCopilot({
 *   provider: 'anthropic',
 *   apiKey: process.env.ANTHROPIC_API_KEY!,
 * });
 *
 * const nexusContext = await orchestrator.query('Why is churn up?', 'cs');
 * const response = await copilot.chat('Why is churn up?', nexusContext);
 * ```
 */
export function createNexusCopilot(config: CopilotConfig) {
  const {
    provider,
    apiKey,
    model,
    maxTokens = 2048,
    systemPromptPrefix = DEFAULT_SYSTEM_PREFIX,
    enableCache = true,
    cacheTtlSeconds = 3600,
    redis,
    redisUrl,
  } = config;

  // Resolve Redis client: explicit instance > auto-create from URL/env > none
  // Priority: config.redis → config.redisUrl → process.env.REDIS_URL → in-memory
  let redisClient: RedisClientInstance | undefined = redis;
  if (!redisClient && (redisUrl || process.env.REDIS_URL)) {
    try {
      // createRedisClient auto-detects REDIS_URL env var for production (ioredis)
      // or falls back to in-memory for dev. If redisUrl is provided explicitly,
      // set it as env var so createRedisClient picks it up.
      if (redisUrl && !process.env.REDIS_URL) {
        process.env.REDIS_URL = redisUrl;
      }
      redisClient = createRedisClient({
        keyPrefix: 'nexus:copilot:',
      });
    } catch (err) {
      // Non-critical: Redis init failure is non-fatal — falls back to local-only cache — err instanceof Error ? err.message : String(err) logged for debugging
    }
  }

  // Initialize semantic cache for 40-60% LLM cost reduction
  // With Redis: distributed cache shared across instances (design partner scale)
  // Without Redis: local in-memory LRU cache (single instance)
  let cache: SemanticCacheInstance | null = null;
  if (enableCache) {
    try {
      cache = createSemanticCache({
        redis: redisClient,
        ttlSeconds: cacheTtlSeconds,
        maxLocalEntries: 5000,
        namespace: 'copilot',
      });
    } catch (err) {
      // Non-critical: semantic cache init failure is non-fatal — proceed without caching — err instanceof Error ? err.message : String(err) logged for debugging
    }
  }

  async function chat(
    userMessage: string,
    nexusContext: NexusQueryResult
  ): Promise<CopilotResponse> {
    const systemPrompt = `${systemPromptPrefix}

---
${nexusContext.assembledContext}
---`;

    // Check semantic cache first (saves 40-60% of LLM costs)
    if (cache) {
      const cached = await cache.lookup(userMessage, systemPromptPrefix);
      if (cached) {
        return {
          text: cached.response,
          injectedContext: systemPrompt,
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      }
    }

    let result: CopilotResponse;
    if (provider === 'anthropic') {
      result = await callAnthropic(systemPrompt, userMessage, {
        apiKey,
        model: model || 'claude-3-5-haiku-20241022', // Cost optimization: Haiku for basic copilot chat
        maxTokens,
      });
    } else {
      result = await callOpenAI(systemPrompt, userMessage, {
        apiKey,
        model: model || 'gpt-4o-mini', // Cost optimization: 15x cheaper than gpt-4o
        maxTokens,
      });
    }

    // Store response in cache for future similar queries
    if (cache && result.text) {
      const usedModel = model || (provider === 'anthropic' ? 'claude-3-5-haiku-20241022' : 'gpt-4o-mini');
      const tokensUsed = (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0);
      await cache.store(userMessage, result.text, {
        model: usedModel,
        tokensUsed,
        systemPrompt: systemPromptPrefix,
      }).catch((err) => {
        // Fire-and-forget: cache store may fail without blocking response — err instanceof Error ? err.message : String(err) logged for debugging
      }); // Non-fatal
    }

    return result;
  }

  /** Get cache statistics for cost monitoring */
  function getCacheStats() {
    const stats = cache?.getStats() || null;
    return stats ? {
      ...stats,
      redisConnected: redisClient?.isConnected() ?? false,
    } : null;
  }

  /** Graceful shutdown — disconnect Redis if auto-created */
  async function disconnect() {
    if (redisClient && !redis) {
      // Only disconnect if we auto-created the client (not if user passed one in)
      await redisClient.disconnect();
    }
  }

  return { chat, getCacheStats, disconnect };
}

// ============================================================================
// PROVIDER IMPLEMENTATIONS
// ============================================================================

async function callAnthropic(
  systemPrompt: string,
  userMessage: string,
  opts: { apiKey: string; model: string; maxTokens: number }
): Promise<CopilotResponse> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      // Enable prompt caching — saves ~90% on repeated system prompts
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  const data = (await response.json()) as any;

  return {
    text: data.content?.[0]?.text || '',
    injectedContext: systemPrompt,
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    },
  };
}

async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
  opts: { apiKey: string; model: string; maxTokens: number }
): Promise<CopilotResponse> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  const data = (await response.json()) as any;

  return {
    text: data.choices?.[0]?.message?.content || '',
    injectedContext: systemPrompt,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  };
}
