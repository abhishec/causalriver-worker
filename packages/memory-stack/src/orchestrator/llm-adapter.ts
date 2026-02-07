/**
 * LLM Adapter (Nexus Copilot)
 *
 * Wraps LLM calls with Nexus context injection.
 * Supports Anthropic and OpenAI APIs.
 */

import type { NexusQueryResult } from './nexus-orchestrator';

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
  } = config;

  async function chat(
    userMessage: string,
    nexusContext: NexusQueryResult
  ): Promise<CopilotResponse> {
    const systemPrompt = `${systemPromptPrefix}

---
${nexusContext.assembledContext}
---`;

    if (provider === 'anthropic') {
      return callAnthropic(systemPrompt, userMessage, {
        apiKey,
        model: model || 'claude-sonnet-4-20250514',
        maxTokens,
      });
    } else {
      return callOpenAI(systemPrompt, userMessage, {
        apiKey,
        model: model || 'gpt-4o',
        maxTokens,
      });
    }
  }

  return { chat };
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
      system: systemPrompt,
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
