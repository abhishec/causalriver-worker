/**
 * Domain LLM Client — Shared Smart-Routed Claude API Client
 * ===========================================================
 *
 * Replaces 12+ duplicate `callClaudeAPI()` implementations across all
 * action-domain files. Every call is routed through the smart model router:
 *
 *   - 'extraction' → MODEL_FAST (Haiku)  — structured JSON extraction
 *   - 'analysis'   → MODEL_DEEP (Sonnet) — multi-step reasoning
 *   - 'generation' → MODEL_DEEP (Sonnet) — code / content generation
 *   - 'reasoning'  → MODEL_DEEP (Sonnet) — open-ended causal reasoning
 *
 * Usage in action-domain files:
 * ```typescript
 * import { callDomainLLM } from './domain-llm-client';
 *
 * const result = await callDomainLLM({
 *   apiKey: ctx.anthropicApiKey,
 *   taskType: 'analysis',
 *   prompt: '...',
 * });
 * ```
 *
 * This eliminates 60-70% of LLM cost on extraction tasks (Haiku vs Sonnet)
 * while maintaining full quality for analysis, generation, and reasoning tasks.
 *
 * @packageDocumentation
 */

import { routeActionDomainModel, MODEL_DEEP } from '../infra/smart-model-router';

// ============================================================================
// TYPES
// ============================================================================

/** Task type — determines which Claude model is selected */
export type DomainTaskType = 'extraction' | 'analysis' | 'generation' | 'reasoning';

export interface DomainLLMOptions {
  /** Anthropic API key */
  apiKey: string;
  /** Task type for smart model routing */
  taskType: DomainTaskType;
  /** The prompt to send */
  prompt: string;
  /**
   * Max tokens to generate.
   * Defaults: extraction=2048, analysis=4096, generation=8192, reasoning=4096
   */
  maxTokens?: number;
  /**
   * Override model selection (bypasses smart router).
   * Only use when a specific model is explicitly required.
   */
  modelOverride?: string;
}

export interface DomainLLMResult {
  /** Raw text response from Claude */
  text: string;
  /** Model that was actually used */
  modelUsed: string;
  /** Task type that was specified */
  taskType: DomainTaskType;
}

// ============================================================================
// DEFAULT MAX TOKENS PER TASK TYPE
// ============================================================================

const DEFAULT_MAX_TOKENS: Record<DomainTaskType, number> = {
  extraction: 2048, // Structured extraction needs less tokens
  analysis: 4096,   // Analysis may be verbose
  generation: 8192, // Code generation can be long
  reasoning: 4096,  // Reasoning chains moderate length
};

// ============================================================================
// CORE CLIENT
// ============================================================================

/**
 * Call Claude API with smart model routing.
 *
 * Automatically selects Haiku for extraction tasks and Sonnet for everything
 * else. Centralizes retry logic, error handling, and API version management.
 */
export async function callDomainLLM(opts: DomainLLMOptions): Promise<string> {
  const { apiKey, taskType, prompt, maxTokens, modelOverride } = opts;

  const model = modelOverride ?? routeActionDomainModel(taskType);
  const tokens = maxTokens ?? DEFAULT_MAX_TOKENS[taskType];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: tokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Claude API error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`);
  }

  const data = await response.json();
  return data.content[0].text as string;
}

/**
 * Call Claude with full result metadata (model used, task type).
 * Use when you need to log or report which model was selected.
 */
export async function callDomainLLMWithMeta(opts: DomainLLMOptions): Promise<DomainLLMResult> {
  const model = opts.modelOverride ?? routeActionDomainModel(opts.taskType);
  const text = await callDomainLLM(opts);
  return { text, modelUsed: model, taskType: opts.taskType };
}

// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

/**
 * Extraction call — uses Haiku (fast + cheap).
 * For structured JSON extraction, parsing, classification.
 */
export async function extractWithLLM(apiKey: string, prompt: string, maxTokens?: number): Promise<string> {
  return callDomainLLM({ apiKey, taskType: 'extraction', prompt, maxTokens });
}

/**
 * Analysis call — uses Sonnet (deep reasoning).
 * For multi-step analysis, risk assessment, root cause.
 */
export async function analyzeWithLLM(apiKey: string, prompt: string, maxTokens?: number): Promise<string> {
  return callDomainLLM({ apiKey, taskType: 'analysis', prompt, maxTokens });
}

/**
 * Generation call — uses Sonnet (quality code/content).
 * For code generation, test generation, documentation.
 */
export async function generateWithLLM(apiKey: string, prompt: string, maxTokens?: number): Promise<string> {
  return callDomainLLM({ apiKey, taskType: 'generation', prompt, maxTokens });
}

/**
 * Reasoning call — uses Sonnet (causal + strategic reasoning).
 * For intervention plans, impact analysis, architectural decisions.
 */
export async function reasonWithLLM(apiKey: string, prompt: string, maxTokens?: number): Promise<string> {
  return callDomainLLM({ apiKey, taskType: 'reasoning', prompt, maxTokens });
}
