/**
 * Stream — Anthropic SDK streaming to process.stdout
 * ═══════════════════════════════════════════════════════
 * Streams Claude responses directly to the terminal.
 */

import Anthropic from '@anthropic-ai/sdk';
import { C } from './ui.js';

// ═══════════════════════════════════════════════════════════════
// STREAMING
// ═══════════════════════════════════════════════════════════════

/**
 * Stream a Claude response to the terminal.
 * Returns the full response text for conversation history.
 */
export async function streamResponse(opts: {
  apiKey: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<string> {
  const anthropic = new Anthropic({ apiKey: opts.apiKey });
  let fullResponse = '';

  try {
    const stream = anthropic.messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.systemPrompt,
      messages: opts.messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        process.stdout.write(event.delta.text);
        fullResponse += event.delta.text;
      }
    }

    // Newline after streaming completes
    process.stdout.write('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`\n\n${C.red}Error: ${msg}${C.reset}\n`);
  }

  return fullResponse;
}
